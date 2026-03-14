const fs = require('fs');
const path = require('path');

const frFile = path.resolve(__dirname, '../src/locales/fr.json');
const fr = JSON.parse(fs.readFileSync(frFile, 'utf8'));

// Updates
function setPath(obj, pathStr, value) {
    const parts = pathStr.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
}

const updates = [
    { p: "email.missingTasksDescription", v: "Envoyer des alertes lorsque des tâches sont manquantes (vérification toutes les 15 minutes)" },
    { p: "email.missingTasksAlerts", v: "Alertes de tâches manquantes" },
    { p: "setup.steps.security.failedToSet", v: "Impossible de configurer le mot de passe" },
    { p: "dashboard.chartPlaceholder", v: "Espace réservé au graphique - sera remplacé par des données réelles" },
    { p: "taskBoard.adminNote", v: "Admin : affiche toutes les tâches lorsque désactivé" },
    { p: "generalSettings.languageAutoSave", v: "Les modifications sont enregistrées automatiquement" },
    { p: "authSettings.externalProvidersNote", v: "Les fournisseurs d'authentification externes permettent aux utilisateurs de se connecter avec le compte de l'organisation. L'authentification locale reste disponible en secours." },
    { p: "export.exportDescription", v: "Planifier des exports automatiques avec livraison par email" },
    { p: "scheduler.masterDesc", v: "Interrupteur principal pour tous les travaux automatisés en arrière-plan." }
];

updates.forEach(u => setPath(fr, u.p, u.v));

fs.writeFileSync(frFile, JSON.stringify(fr, null, 4));
console.log('fr.json has been refined successfully.');
