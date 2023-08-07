import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { network, deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("HintHelpers", {
    from: deployer,
    log: true,
  });
};

export default func;
func.id = "deploy_hint_helpers";
func.tags = ["DeployHintHelpers"];
