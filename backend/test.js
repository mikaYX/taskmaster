const d = { 
  delegatedBy: { fullname: "", username: "" }, 
  targetUsers: [{ fullname: undefined, username: undefined }], 
  targetGroups: [] 
};
const delegator = d.delegatedBy?.fullname || d.delegatedBy?.username || "Inconnu";
const tUsers = d.targetUsers?.map(tu => tu.fullname || tu.username) || [];
const tGroups = d.targetGroups?.map(tg => `${tg.name} (groupe)`) || [];
const targetsList = [...tUsers, ...tGroups];
const targets = targetsList.length > 0 ? targetsList.join(", ") : "Aucun bénéficiaire";
console.log(`Délégué de ${delegator} vers ${targets}`);
