import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { network, deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("WrapToken", {
    from: deployer,
    log: true,
  });
};

export default func;
func.id = "deploy_wrap_token";
func.tags = ["DeployWrapToken"];
