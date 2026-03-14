# Guide i18n

Ce guide explique comment maintenir une internationalisation propre dans le frontend Taskmaster, sans fallback implicite et avec un contrôle automatisé en CI.

## Contexte

Taskmaster centralise ses traductions dans :

- `../frontend/src/locales/fr.json`
- `../frontend/src/locales/en.json`

L'objectif est de conserver des fichiers synchronisés, des placeholders identiques et zéro texte métier codé en dur dans les composants.

## Pré-requis

- Intervenir sur le frontend React.
- Connaître les clés de traduction concernées.
- Lancer les commandes depuis `frontend/` ou utiliser `npm -w frontend ...` depuis la racine.

## Étapes

### Ajouter ou modifier une traduction

1. Ajoutez la clé dans `fr.json`.
2. Ajoutez exactement la même clé dans `en.json`.
3. Utilisez la clé via `t("...")` sans texte de secours inline.

Exemple à éviter :

```tsx
<span>{t("components.button", "Valider")}</span>
```

Exemple attendu :

```tsx
<span>{t("components.button")}</span>
```

### Exécuter le contrôle i18n

Le script `check:i18n` échoue si :

1. Une clé existe dans une langue mais pas dans l'autre.
2. Les placeholders diffèrent entre les deux langues.
3. Une clé est utilisée dans le code mais absente des fichiers JSON.
4. Un fallback inline est détecté.

```bash
cd frontend
npm run check:i18n
```

### Relire avant une pull request

- [ ] La clé existe dans `fr.json`.
- [ ] La clé existe dans `en.json`.
- [ ] Les placeholders sont identiques entre les langues.
- [ ] Aucun `t("key", "texte en dur")` n'a été ajouté.
- [ ] `npm run check:i18n` passe localement.

## Vérifications

- Le script `npm run check:i18n` retourne un code de sortie `0`.
- Les revues de code ne signalent pas de chaîne codée en dur dans l'interface.
- Les clés supprimées ne laissent pas de références mortes dans les composants.

## Ressources

- Script de contrôle : [`../frontend/scripts/check-i18n.cjs`](../frontend/scripts/check-i18n.cjs)
- Frontend : [`../frontend/package.json`](../frontend/package.json)
- README principal : [`../README.md`](../README.md)

Notes :

- Les placeholders `{{variable}}` doivent rester strictement identiques d'une langue à l'autre.
- Le projet prend en charge une migration progressive, mais chaque nouvelle contribution doit respecter la règle stricte.

## Voir aussi

- [`./TIPS.md`](./TIPS.md)
- [`../SETUP.md`](../SETUP.md)
