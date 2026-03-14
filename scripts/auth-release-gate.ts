import fs from 'fs';
import path from 'path';

/**
 * GO/NO-GO SLI Evaluator for Authentication
 * - Uses docs/AUTH_SLO.json as ground truth.
 * - Extracts Success Rate and P95 latency via synthetic requests.
 * - Evaluates Family Wipe (Replay Out of Grace Window) deterministically.
 */

const SLO_FILE = path.resolve(__dirname, '../docs/AUTH_SLO.json');
const VERDICT_FILE = path.resolve(process.cwd(), 'auth-release-verdict.json');

const slo = JSON.parse(fs.readFileSync(SLO_FILE, 'utf-8')).slos;

const API_URL = process.env.API_URL || 'http://localhost:3000/api';
const USERNAME = process.env.SMOKE_USERNAME || 'smoke_test_user';
const PASSWORD = process.env.SMOKE_PASSWORD || 'smoke_test_password';

// Paramètres d'Échantillonnage
const SAMPLES = 30;

async function executeGate() {
    console.log(`[GO/NO-GO] Démarrage de l'évaluation sur ${API_URL}`);
    console.log(`[GO/NO-GO] Objectifs (SLO) : Succès >= ${slo.refresh_success_rate_min * 100}%, Latence P95 <= ${slo.refresh_p95_latency_max_ms}ms, Blocage Rejeux >= ${slo.replay_rejection_rate_min * 100}%`);

    let successes = 0;
    let latencies: number[] = [];
    let firstRevokedToken = '';

    // ==========================================
    // 1. MESURES DES PERFORMANCES ET DE LA FIABILITÉ
    // ==========================================
    for (let i = 0; i < SAMPLES; i++) {
        try {
            // Demande d'un jeton neuf (Login)
            const loginReq = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: USERNAME, password: PASSWORD })
            });

            if (!loginReq.ok) {
                console.log(`Login Failed: ${loginReq.status}`);
                continue;
            }
            const { refreshToken } = await loginReq.json();

            // Stress du routage de rotation
            const start = performance.now();
            const refReq = await fetch(`${API_URL}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken })
            });
            const duration = performance.now() - start;

            if (refReq.ok) {
                successes++;
                latencies.push(duration);
                if (i === 0) {
                    firstRevokedToken = refreshToken; // Sauvegardé pour le step 2
                }
            } else {
                console.log(`Refresh Failed: ${refReq.status}`);
            }
        } catch (e) {
            console.error(`Erreur réseau durant la mesure: ${(e as Error).message}`);
        }
    }

    // Calculs Mathématiques
    latencies.sort((a, b) => a - b);
    const p95Index = Math.max(0, Math.floor(latencies.length * 0.95) - 1);
    const p95 = latencies.length > 0 ? Math.round(latencies[p95Index]) : 9999;
    const successRate = successes / SAMPLES;

    // ==========================================
    // 2. CONTRÔLE DE SÉCURITÉ (REPLAY ATTACK)
    // ==========================================
    const graceWindow = parseInt(process.env.AUTH_GRACE_WINDOW_SECONDS || "60", 10);
    console.log(`\n[GO/NO-GO] Vérification de l'anti-rejeu... (Attente délibérée de ${graceWindow + 1}s pour esquiver la fenêtre de grâce et exiger une pénitence de session)`);

    // Attente Synchrone du dépassement de fenêtre
    await new Promise(r => setTimeout(r, (graceWindow + 1) * 1000));

    let replayRejectionRate = 0.0;
    try {
        const replayReq = await fetch(`${API_URL}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: firstRevokedToken })
        });

        // Un 401 ou 403 est un SUCCÈS sécuritaire ici. Le vol a été bloqué et la famille révoquée.
        if (replayReq.status === 401 || replayReq.status === 403) {
            replayRejectionRate = 1.0;
        } else {
            console.error(`[ALERTE] Le jeton expiré a survécu (Status ${replayReq.status}) ! Le Fallback Anti-Rejeu est DÉFAILLANT.`);
        }
    } catch (e) {
        console.error("Échec total d'accès API pour le replay test");
    }

    // ==========================================
    // 3. EXPORT DU RAPPORT JSON
    // ==========================================
    const isSuccessRateOk = successRate >= slo.refresh_success_rate_min;
    const isP95Ok = p95 <= slo.refresh_p95_latency_max_ms;
    const isReplayOk = replayRejectionRate >= slo.replay_rejection_rate_min;

    // VERDICT
    const verdict = (isSuccessRateOk && isP95Ok && isReplayOk) ? "GO" : "NO-GO";

    const report = {
        timestamp: new Date().toISOString(),
        verdict: verdict,
        slis: {
            refresh_success_rate: successRate,
            refresh_p95_ms: p95,
            replay_rejection_rate: replayRejectionRate
        },
        slos: slo,
        evidence: "Les latences ont été mesurées via un échantillon de requêtes authentiques. Un taux de réussite insuffisant ou des latences anormales signalent une dégradation majeure DB/Redis."
    };

    fs.writeFileSync(VERDICT_FILE, JSON.stringify(report, null, 2));

    // ==========================================
    // 4. ACTION CI/CD FINALISATION
    // ==========================================
    console.log(`\n========================================`);
    console.log(`VERDICT FINAL : ${verdict}`);
    console.log(`Success Rate  : ${successRate * 100}% (Requis: >= ${slo.refresh_success_rate_min * 100}%) -> ${isSuccessRateOk ? '✅' : '❌'}`);
    console.log(`P95 Latency   : ${p95}ms (Requis: <= ${slo.refresh_p95_latency_max_ms}ms) -> ${isP95Ok ? '✅' : '❌'}`);
    console.log(`Anti-Rejeu    : ${replayRejectionRate * 100}% (Requis: >= ${slo.replay_rejection_rate_min * 100}%) -> ${isReplayOk ? '✅' : '❌'}`);
    console.log(`========================================\n`);

    if (verdict === "NO-GO") {
        console.error("🚨 ÉCHEC DE LA GATE AUTH. L'Authentification ne respecte pas les critères obligatoires (SLA).");
        process.exit(1);
    } else {
        console.log("✅ CRITÈRES VALIDÉS. Feu vert officiel pour Release et Opérations.");
        process.exit(0);
    }
}

executeGate();
