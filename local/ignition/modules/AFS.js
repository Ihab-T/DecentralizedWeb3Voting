import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("AFSModule", (m) => {
  const oracle = m.getParameter("oracle", m.getAccount(0));
  const contract = m.contract("ConstructionMilestones", [oracle]);
  return { contract };
});
