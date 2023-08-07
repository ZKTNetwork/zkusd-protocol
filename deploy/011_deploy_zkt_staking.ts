import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { network, deployments, getNamedAccounts, ethers } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("ZKTStaking", {
    from: deployer,
    log: true,
    args: [deployer],
  });
};

export default func;
func.id = "deploy_zkt_staking";
func.tags = ["DeployZKTStaking"];
