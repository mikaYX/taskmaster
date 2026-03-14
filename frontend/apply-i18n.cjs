const fs = require('fs');
const fallbacks = JSON.parse(fs.readFileSync('output2.json', 'utf8'));

const frTranslations = {
    "profile.myProfile": "Mon Profil",
    "sites.selectSite": "Sélectionner un site",
    "sites.allSites": "Tous les sites",
    "scheduler.nextRuns": "Prochaines exécutions (Heure du serveur)",
    "scheduler.cronError": "Expression cron invalide",
    "scheduler.serverTimeNote": "Calculé sur le fuseau horaire du serveur",
    "common.saveSuccess": "Paramètres enregistrés avec succès",
    "common.saveError": "Échec de l'enregistrement",
    "email.testSuccess": "Email de test envoyé avec succès",
    "email.testError": "Échec de l'envoi de l'email de test",
    "settings.apiKeys.title": "Clés API",
    "settings.apiKeys.description": "Gérer les clés d'accès pour les intégrations externes",
    "settings.notifications.updated": "Canal mis à jour avec succès",
    "settings.notifications.created": "Canal créé avec succès",
    "settings.notifications.error": "Échec de l'enregistrement du canal",
    "settings.notifications.deleted": "Canal supprimé avec succès",
    "settings.notifications.deleteError": "Échec de la suppression du canal",
    "settings.notifications.testSuccess": "Test exécuté avec succès",
    "settings.notifications.testError": "Le test a échoué",
    "settings.notifications.title": "Canaux de Notifications",
    "settings.notifications.description": "Configurer les canaux de notifications pour les alertes de tâches et les rappels.",
    "settings.notifications.add": "Ajouter un canal",
    "common.updated": "Mis à jour",
    "common.error": "Erreur",
    "settings.notifications.editChannel": "Modifier le canal",
    "settings.notifications.addChannel": "Ajouter un canal",
    "common.name": "Nom",
    "common.type": "Type",
    "common.confirmDelete": "Êtes-vous sûr ?",
    "settings.notifications.deleteWarning": "Cette action est irréversible. Les notifications utilisant ce canal ne fonctionneront plus.",
    "settings.notifications.testChannel": "Tester le canal",
    "settings.notifications.testDescription": "Envoyer un message de test sur ce canal.",
    "settings.notifications.testEmailAddress": "Adresse email de test",
    "scheduler.disabledWarning": "Planificateur désactivé. Tous les jobs sont suspendus.",
    "scheduler.enabledSuccess": "Planificateur activé.",
    "scheduler.masterSwitch": "Planificateur Global",
    "scheduler.masterDesc": "Interrupteur global pour tous les travaux en arrière-plan automatisés.",
    "settings.usersManager": "Gestion des Utilisateurs",
    "settings.groupsManager": "Gestion des Groupes",
    "sites.created": "Site créé",
    "sites.createError": "Échec de la création du site",
    "sites.updated": "Site mis à jour",
    "sites.updateError": "Échec de la mise à jour du site",
    "sites.deleted": "Site supprimé",
    "sites.deleteError": "Échec de la suppression du site",
    "sites.title": "Sites",
    "sites.description": "Gérer les sites et localisations de votre organisation",
    "sites.create": "Nouveau Site",
    "sites.createTitle": "Créer un Site",
    "sites.empty": "Aucun site configuré",
    "sites.name": "Nom",
    "sites.code": "Code",
    "sites.users": "Utilisateurs",
    "sites.tasks": "Tâches",
    "sites.groups": "Groupes",
    "common.actions": "Actions",
    "sites.deleteConfirm": "Supprimer le site ?",
    "sites.editTitle": "Modifier le site",
    "sites.formDescription": "Configurer les détails du site",
    "sites.descriptionLabel": "Description",
    "sites.descriptionPlaceholder": "Description facultative...",
    "common.saving": "Enregistrement...",
    "settings.apiKeys": "Clés API",
    "settings.sites": "Sites",
    "settings.notifications.tab": "Notifications"
};

function deepMerge(obj, path, value) {
    const parts = path.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) current[parts[i]] = {};
        current = current[parts[i]];
    }
    if (!current[parts[parts.length - 1]]) {
        current[parts[parts.length - 1]] = value;
    }
}

const enFile = 'src/locales/en.json';
const frFile = 'src/locales/fr.json';
const enObj = JSON.parse(fs.readFileSync(enFile, 'utf8'));
const frObj = JSON.parse(fs.readFileSync(frFile, 'utf8'));

// Insert missing nav.exports / nav.backups into fr if not there
deepMerge(frObj, 'nav.exports', "Exports");
deepMerge(frObj, 'nav.backups', "Sauvegardes");

fallbacks.forEach(f => {
    deepMerge(enObj, f.key, f.fb);
    const frText = frTranslations[f.key] || f.fb; // fallback to English string if missing
    deepMerge(frObj, f.key, frText);
});

fs.writeFileSync(enFile, JSON.stringify(enObj, null, 4));
fs.writeFileSync(frFile, JSON.stringify(frObj, null, 4));

// Replace strings in source
const modifiedFiles = new Set();
fallbacks.forEach(f => {
    const content = fs.readFileSync(f.file, 'utf8');
    // Only replace specific lines to be safe? Or whole file. Whole file is ok.
    // Regex to remove the fallback. We look for t('key', 'fallback') or similar.
    // Because formatting can wary, we'll replace specifically what matched in output2.json exactly?
    // Easier: replace globally in the file for this specific key
    const safeKey = f.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const safeFb = f.fb.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(t\\(\\s*['"\`])${safeKey}(['"\`]\\s*),\\s*['"\`]${safeFb}['"\`](\\s*\\))`, 'g');
    const newContent = content.replace(regex, '$1' + f.key + '$2$3');

    if (content !== newContent) {
        fs.writeFileSync(f.file, newContent);
        modifiedFiles.add(f.file);
    }
});

console.log('Modified source files:', Array.from(modifiedFiles).join(', '));
console.log('Updated JSON Locales');
