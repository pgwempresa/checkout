#!/usr/bin/env node
/**
 * CheckoutPay — Vercel Setup Script
 *
 * O que faz:
 *  1. Lê o .env local
 *  2. Envia cada variável para o Vercel (production + preview)
 *  3. Faz o deploy para produção
 *  4. Mostra a URL final
 *
 * Uso:
 *   node scripts/vercel-setup.mjs          → só envia env vars
 *   node scripts/vercel-setup.mjs --deploy → env vars + deploy
 *   node scripts/vercel-setup.mjs --deploy --domain checkout.seudominio.com.br
 */

import { readFileSync, existsSync } from "fs";
import { execSync, spawnSync } from "child_process";
import { join } from "path";
import { fileURLToPath } from "url";
import readline from "readline";

const ROOT   = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const args   = process.argv.slice(2);
const DO_DEPLOY = args.includes("--deploy");
const DOMAIN    = args[args.indexOf("--domain") + 1] || "";

// ── Colors ────────────────────────────────────────────────────
const c = {
    reset:  "\x1b[0m",
    bold:   "\x1b[1m",
    green:  "\x1b[32m",
    blue:   "\x1b[34m",
    yellow: "\x1b[33m",
    red:    "\x1b[31m",
    dim:    "\x1b[2m"
};

const ok  = (msg) => console.log(`  ${c.green}✓${c.reset}  ${msg}`);
const info = (msg) => console.log(`  ${c.blue}→${c.reset}  ${msg}`);
const warn  = (msg) => console.log(`  ${c.yellow}⚠${c.reset}  ${msg}`);
const err   = (msg) => console.log(`  ${c.red}✕${c.reset}  ${msg}`);
const title = (msg) => console.log(`\n${c.bold}${msg}${c.reset}`);

// ── Check Vercel CLI ──────────────────────────────────────────
function checkVercelCli() {
    try {
        execSync("npx vercel --version", { stdio: "pipe" });
        return true;
    } catch {
        return false;
    }
}

// ── Parse .env ────────────────────────────────────────────────
function parseEnv(filePath) {
    if (!existsSync(filePath)) return {};
    const lines = readFileSync(filePath, "utf8").split("\n");
    const vars  = {};

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        const eqIdx = trimmed.indexOf("=");
        if (eqIdx < 1) continue;

        const key   = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();

        if (key && value && !value.startsWith("#")) {
            vars[key] = value;
        }
    }

    return vars;
}

// ── Run command (with live output) ───────────────────────────
function run(cmd, opts = {}) {
    const result = spawnSync(cmd, { shell: true, stdio: "pipe", ...opts });
    return {
        ok:     result.status === 0,
        stdout: result.stdout?.toString() || "",
        stderr: result.stderr?.toString() || ""
    };
}

// ── Set Vercel env var ────────────────────────────────────────
function setVercelEnv(key, value, environments = ["production", "preview"]) {
    for (const env of environments) {
        // Remove existing first (ignore errors)
        run(`echo "" | npx vercel env rm ${key} ${env} -y 2>/dev/null`, {});

        // Add new value
        const result = spawnSync(
            "npx", ["vercel", "env", "add", key, env],
            {
                input: value + "\n",
                encoding: "utf8",
                stdio: ["pipe", "pipe", "pipe"],
                cwd: ROOT
            }
        );

        if (result.status !== 0) {
            warn(`${key} (${env}): ${result.stderr?.trim() || "falha"}`);
            return false;
        }
    }
    return true;
}

// ── Prompt ────────────────────────────────────────────────────
function prompt(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
    console.log(`\n${c.bold}${c.blue}  ⚡ CheckoutPay — Vercel Setup${c.reset}\n`);

    // 1. Check CLI
    if (!checkVercelCli()) {
        err("Vercel CLI não encontrado. Instale com: npm install -g vercel");
        process.exit(1);
    }
    ok("Vercel CLI encontrado");

    // 2. Check login
    const whoami = run("npx vercel whoami");
    if (!whoami.ok) {
        warn("Você não está logado no Vercel.");
        info("Execute:  npx vercel login");
        process.exit(1);
    }
    ok(`Logado como: ${whoami.stdout.trim()}`);

    // 3. Parse .env
    const envPath = join(ROOT, ".env");
    if (!existsSync(envPath)) {
        err(".env não encontrado. Copie .env.example para .env e preencha os valores.");
        process.exit(1);
    }

    const vars = parseEnv(envPath);
    const keys = Object.keys(vars);
    info(`${keys.length} variáveis encontradas no .env`);

    // Skip vars that are clearly empty/placeholder
    const SKIP = ["", "troque-essa-senha", "https://checkout.seudominio.com.br", "https://minhaloja.com.br"];
    const toSet = keys.filter(k => !SKIP.includes(vars[k]));

    if (toSet.length === 0) {
        warn("Nenhuma variável pronta para enviar. Preencha o .env antes de continuar.");
        process.exit(1);
    }

    // 4. Confirm
    title("  Variáveis que serão enviadas:");
    for (const k of toSet) {
        const v = vars[k];
        const display = k.toLowerCase().includes("key") || k.toLowerCase().includes("password") || k.toLowerCase().includes("token")
            ? v.slice(0, 4) + "••••••••"
            : v;
        console.log(`     ${c.dim}${k}${c.reset} = ${display}`);
    }

    const answer = await prompt("\n  Confirmar? (s/n): ");
    if (answer.toLowerCase() !== "s" && answer.toLowerCase() !== "sim") {
        info("Cancelado.");
        process.exit(0);
    }

    // 5. Send env vars
    title("  Enviando variáveis para o Vercel...");
    let sent = 0;
    for (const key of toSet) {
        const success = setVercelEnv(key, vars[key]);
        if (success) {
            ok(key);
            sent++;
        }
    }
    info(`${sent}/${toSet.length} variáveis enviadas`);

    // 6. Deploy
    if (DO_DEPLOY) {
        title("  Fazendo deploy...");
        const deploy = run("npx vercel --prod", { stdio: "inherit", cwd: ROOT });

        if (!deploy.ok) {
            err("Deploy falhou. Verifique os erros acima.");
            process.exit(1);
        }

        // 7. Domain
        if (DOMAIN) {
            title("  Configurando domínio...");
            const domainResult = run(`npx vercel domains add ${DOMAIN}`);
            if (domainResult.ok) {
                ok(`Domínio ${DOMAIN} adicionado`);
                info(`Configure o DNS: CNAME ${DOMAIN} → cname.vercel-dns.com`);
            } else {
                warn(`Domínio: ${domainResult.stderr.trim()}`);
            }
        }
    }

    // 8. Done
    title("  Pronto!");
    if (!DO_DEPLOY) {
        info("Variáveis enviadas. Para fazer o deploy, execute:");
        console.log(`     ${c.bold}node scripts/vercel-setup.mjs --deploy${c.reset}`);
        console.log(`     ${c.bold}node scripts/vercel-setup.mjs --deploy --domain checkout.seudominio.com.br${c.reset}`);
    }
    console.log();
}

main().catch((e) => {
    err(e.message);
    process.exit(1);
});
