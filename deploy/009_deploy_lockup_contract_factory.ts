import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { network, deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("LockupContractFactory", {
    from: deployer,
    log: true,
  });
};

export default func;
func.id = "deploy_lockup_contract_factory";
func.tags = ["DeployLockupContractFactory"];
