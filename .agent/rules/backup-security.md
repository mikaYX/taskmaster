# Backup Security Rules

- **BACKUP_ENCRYPTION_KEY Protection**: Ne jamais exposer la valeur complète de la clé dans l'UI, les logs ou les erreurs.
- **Default Key Warning**: Si `BACKUP_ENCRYPTION_KEY` correspond aux valeurs par défaut (`change-me-to-a-random-hex-string` ou `your-secure-encryption-key-min-32-chars`), un avertissement critique doit être affiché.
- **Production Enforcement**: En production, l'utilisation de la clé par défaut doit être signalée comme un risque critique.
- **Minimal Exposure**: Seule l'existence (booléen) ou le statut (par défaut ou non) de la clé peut être exposé via l'API de statut.
