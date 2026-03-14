---
trigger: manual
---

SYSTEM RULE — DESIGN SYSTEM FRONTEND (OBLIGATOIRE)

Cette règle s’applique à TOUT le frontend de l’application Taskmaster,
sans exception, maintenant et dans toutes les phases futures.

=====================================================
🎯 OBJECTIF
=====================================================

Garantir une interface cohérente, maintenable et accessible
en imposant l’utilisation exclusive de shadcn/ui
comme design system de référence.

=====================================================
🧱 RÈGLES NON NÉGOCIABLES
=====================================================

1. Design system officiel :
   - shadcn/ui est le SEUL design system autorisé.
   - Les composants doivent être utilisés via leur implémentation shadcn/ui locale.
   - Aucun autre framework UI (Material UI, AntD, Chakra, etc.) n’est autorisé.

2. Interdictions explicites :
   - Pas de composants HTML stylés “à la main” pour des éléments UI standards
     (boutons, modales, dialogs, inputs, dropdowns, tables, toasts).
   - Pas de CSS custom pour recréer des composants déjà existants dans shadcn/ui.
   - Pas de composants inline non réutilisables.
   - Les primitives HTML (button, input, select, textarea, dialog)
     ne sont autorisées que dans src/components/ui/



3. TailwindCSS :
   - Utilisé UNIQUEMENT pour :
     - layout (grid, flex, spacing)
     - ajustements visuels mineurs
   - Jamais pour redéfinir un composant UI existant dans shadcn/ui.

=====================================================
🧩 STRUCTURE ATTENDUE
=====================================================

- Tous les composants shadcn/ui doivent être centralisés dans :
  src/components/ui/

- Les composants métier doivent :
  - composer des composants shadcn/ui
  - ne jamais réimplémenter des primitives UI

=====================================================
🧠 MÉTHODOLOGIE DE CONCEPTION
=====================================================

Avant de créer un écran ou un composant :
1. Identifier les composants shadcn/ui existants utilisables
2. Composer l’UI à partir de ces composants
3. Justifier toute exception (très rare)

=====================================================
🛑 RÈGLE DE VALIDATION
=====================================================

Si un écran ou un composant frontend est proposé :
- Il DOIT mentionner explicitement :
  - quels composants shadcn/ui sont utilisés
- S’il n’utilise pas shadcn/ui :
  - la proposition est considérée comme invalide

=====================================================
🛑 RÈGLE FINALE
=====================================================

Toute implémentation frontend qui ne respecte pas cette règle
doit être rejetée et corrigée avant validation.
App.tsx est strictement réservé au routing.
Aucune logique métier, aucun layout, aucun composant UI complexe.


Cette règle prime sur toute autre considération de vitesse ou de simplicité.