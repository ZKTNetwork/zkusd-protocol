import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { network, deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("StabilityPool", {
    from: deployer,
    log: true,
  });
};

export default func;
func.id = "deploy_stability_pool";
func.tags = ["DeployStabilityPool"];
