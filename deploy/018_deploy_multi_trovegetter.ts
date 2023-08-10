import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { ethers } from "hardhat";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { network, deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const troveManager = await ethers.getContract("TroveManager");
  const sortedTroves = await ethers.getContract("SortedTroves");

  console.log("Deploying MultiTroveGetter");
  await deploy("MultiTroveGetter", {
    from: deployer,
    log: true,
    args: [troveManager.address, sortedTroves.address],
  });
};

export default func;
func.id = "deploy_multi_trove_getter";
func.tags = ["DeployMultiTroveGetter"];
func.dependencies = ["DeployTroveManager", "DeploySortedTroves"];
