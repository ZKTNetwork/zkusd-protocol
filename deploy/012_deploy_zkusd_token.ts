import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { network, deployments, getNamedAccounts, ethers } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const troveManager = await ethers.getContract("TroveManager");
  const borrowerOperations = await ethers.getContract("BorrowerOperations");
  const stabilityPool = await ethers.getContract("StabilityPool");
  await deploy("ZKUSDToken", {
    from: deployer,
    log: true,
    args: [
      troveManager.address,
      stabilityPool.address,
      borrowerOperations.address,
    ],
  });
};

export default func;
func.id = "deploy_zkusd_token";
func.tags = ["DeployZKUSDToken"];
func.dependencies = [
  "DeployStabilityPool",
  "DeployBorrowerOperations",
  "DeployTroveManager",
];
