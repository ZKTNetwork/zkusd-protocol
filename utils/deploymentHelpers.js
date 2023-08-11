const SortedTroves = artifacts.require("./SortedTroves.sol")
const TroveManager = artifacts.require("./TroveManager.sol")
const PriceFeedTestnet = artifacts.require("./PriceFeedTestnet.sol")
const ZKUSDToken = artifacts.require("./ZKUSDToken.sol")
const ActivePool = artifacts.require("./ActivePool.sol");
const DefaultPool = artifacts.require("./DefaultPool.sol");
const StabilityPool = artifacts.require("./StabilityPool.sol")
const GasPool = artifacts.require("./GasPool.sol")
const CollSurplusPool = artifacts.require("./CollSurplusPool.sol")
const FunctionCaller = artifacts.require("./TestContracts/FunctionCaller.sol")
const BorrowerOperations = artifacts.require("./BorrowerOperations.sol")
const HintHelpers = artifacts.require("./HintHelpers.sol")

const ZKTStaking = artifacts.require("./ZKTStaking.sol")
const ZKToken = artifacts.require("./ZKToken.sol")
const LockupContractFactory = artifacts.require("./LockupContractFactory.sol")
const CommunityIssuance = artifacts.require("./CommunityIssuance.sol")

const Unipool = artifacts.require("./Unipool.sol")

const ZKTokenTester = artifacts.require("./ZKTokenTester.sol")
const CommunityIssuanceTester = artifacts.require("./CommunityIssuanceTester.sol")
const StabilityPoolTester = artifacts.require("./StabilityPoolTester.sol")
const ActivePoolTester = artifacts.require("./ActivePoolTester.sol")
const DefaultPoolTester = artifacts.require("./DefaultPoolTester.sol")
const LiquityMathTester = artifacts.require("./LiquityMathTester.sol")
const BorrowerOperationsTester = artifacts.require("./BorrowerOperationsTester.sol")
const TroveManagerTester = artifacts.require("./TroveManagerTester.sol")
const ZKUSDTokenTester = artifacts.require("./ZKUSDTokenTester.sol")

// Proxy scripts
const BorrowerOperationsScript = artifacts.require('BorrowerOperationsScript')
const BorrowerWrappersScript = artifacts.require('BorrowerWrappersScript')
const TroveManagerScript = artifacts.require('TroveManagerScript')
const StabilityPoolScript = artifacts.require('StabilityPoolScript')
const TokenScript = artifacts.require('TokenScript')
const ZKTStakingScript = artifacts.require('ZKTStakingScript')
const {
    buildUserProxies,
    BorrowerOperationsProxy,
    BorrowerWrappersProxy,
    TroveManagerProxy,
    StabilityPoolProxy,
    SortedTrovesProxy,
    TokenProxy,
    ZKTStakingProxy
} = require('../utils/proxyHelpers.js')

/* "Liquity core" consists of all contracts in the core Liquity system.

ZKT contracts consist of only those contracts related to the ZKT Token:

-the ZKT token
-the Lockup factory and lockup contracts
-the ZKTStaking contract
-the CommunityIssuance contract 
*/

const ZERO_ADDRESS = '0x' + '0'.repeat(40)
const maxBytes32 = '0x' + 'f'.repeat(64)

class DeploymentHelper {

    static async deployLiquityCore() {
        const cmdLineArgs = process.argv
        const frameworkPath = cmdLineArgs[1]
        // console.log(`Framework used:  ${frameworkPath}`)

        if (frameworkPath.includes("hardhat")) {
            return this.deployLiquityCoreHardhat()
        } else if (frameworkPath.includes("truffle")) {
            return this.deployLiquityCoreTruffle()
        }
    }

    static async deployZKTContracts(bountyAddress, lpRewardsAddress, multisigAddress) {
        const cmdLineArgs = process.argv
        const frameworkPath = cmdLineArgs[1]
        // console.log(`Framework used:  ${frameworkPath}`)

        if (frameworkPath.includes("hardhat")) {
            return this.deployZKTContractsHardhat(bountyAddress, lpRewardsAddress, multisigAddress)
        } else if (frameworkPath.includes("truffle")) {
            return this.deployZKTContractsTruffle(bountyAddress, lpRewardsAddress, multisigAddress)
        }
    }

    static async deployLiquityCoreHardhat() {
        const priceFeedTestnet = await PriceFeedTestnet.new()
        const sortedTroves = await SortedTroves.new()
        const troveManager = await TroveManager.new()
        const activePool = await ActivePool.new()
        const stabilityPool = await StabilityPool.new()
        const gasPool = await GasPool.new()
        const defaultPool = await DefaultPool.new()
        const collSurplusPool = await CollSurplusPool.new()
        const functionCaller = await FunctionCaller.new()
        const borrowerOperations = await BorrowerOperations.new()
        const hintHelpers = await HintHelpers.new()
        const zkusdToken = await ZKUSDToken.new(
            troveManager.address,
            stabilityPool.address,
            borrowerOperations.address
        )
        ZKUSDToken.setAsDeployed(zkusdToken)
        DefaultPool.setAsDeployed(defaultPool)
        PriceFeedTestnet.setAsDeployed(priceFeedTestnet)
        SortedTroves.setAsDeployed(sortedTroves)
        TroveManager.setAsDeployed(troveManager)
        ActivePool.setAsDeployed(activePool)
        StabilityPool.setAsDeployed(stabilityPool)
        GasPool.setAsDeployed(gasPool)
        CollSurplusPool.setAsDeployed(collSurplusPool)
        FunctionCaller.setAsDeployed(functionCaller)
        BorrowerOperations.setAsDeployed(borrowerOperations)
        HintHelpers.setAsDeployed(hintHelpers)

        const coreContracts = {
            priceFeedTestnet,
            zkusdToken,
            sortedTroves,
            troveManager,
            activePool,
            stabilityPool,
            gasPool,
            defaultPool,
            collSurplusPool,
            functionCaller,
            borrowerOperations,
            hintHelpers
        }
        return coreContracts
    }

    static async deployTesterContractsHardhat() {
        const testerContracts = {}

        // Contract without testers (yet)
        testerContracts.priceFeedTestnet = await PriceFeedTestnet.new()
        testerContracts.sortedTroves = await SortedTroves.new()
        // Actual tester contracts
        testerContracts.communityIssuance = await CommunityIssuanceTester.new()
        testerContracts.activePool = await ActivePoolTester.new()
        testerContracts.defaultPool = await DefaultPoolTester.new()
        testerContracts.stabilityPool = await StabilityPoolTester.new()
        testerContracts.gasPool = await GasPool.new()
        testerContracts.collSurplusPool = await CollSurplusPool.new()
        testerContracts.math = await LiquityMathTester.new()
        testerContracts.borrowerOperations = await BorrowerOperationsTester.new()
        testerContracts.troveManager = await TroveManagerTester.new()
        testerContracts.functionCaller = await FunctionCaller.new()
        testerContracts.hintHelpers = await HintHelpers.new()
        testerContracts.zkusdToken = await ZKUSDTokenTester.new(
            testerContracts.troveManager.address,
            testerContracts.stabilityPool.address,
            testerContracts.borrowerOperations.address
        )
        return testerContracts
    }

    static async deployZKTContractsHardhat(bountyAddress, lpRewardsAddress, multisigAddress) {
        const accounts = await web3.eth.getAccounts()
        const zktStaking = await ZKTStaking.new(accounts[0])
        const lockupContractFactory = await LockupContractFactory.new()
        const communityIssuance = await CommunityIssuance.new()

        ZKTStaking.setAsDeployed(zktStaking)
        LockupContractFactory.setAsDeployed(lockupContractFactory)
        CommunityIssuance.setAsDeployed(communityIssuance)

        // Deploy ZKT Token, passing Community Issuance and Factory addresses to the constructor
        const zkToken = await ZKToken.new(
            communityIssuance.address,
            zktStaking.address,
            lockupContractFactory.address,
            bountyAddress,
            lpRewardsAddress,
            multisigAddress
        )
        ZKToken.setAsDeployed(zkToken)

        const ZKTContracts = {
            zktStaking,
            lockupContractFactory,
            communityIssuance,
            zkToken
        }
        return ZKTContracts
    }

    static async deployZKTTesterContractsHardhat(bountyAddress, lpRewardsAddress, multisigAddress) {
        const zktStaking = await ZKTStaking.new()
        const lockupContractFactory = await LockupContractFactory.new()
        const communityIssuance = await CommunityIssuanceTester.new()

        ZKTStaking.setAsDeployed(zktStaking)
        LockupContractFactory.setAsDeployed(lockupContractFactory)
        CommunityIssuanceTester.setAsDeployed(communityIssuance)

        // Deploy ZKT Token, passing Community Issuance and Factory addresses to the constructor
        const zkToken = await ZKTokenTester.new(
            communityIssuance.address,
            zktStaking.address,
            lockupContractFactory.address,
            bountyAddress,
            lpRewardsAddress,
            multisigAddress
        )
        ZKTokenTester.setAsDeployed(zkToken)

        const ZKTContracts = {
            zktStaking,
            lockupContractFactory,
            communityIssuance,
            zkToken
        }
        return ZKTContracts
    }

    static async deployLiquityCoreTruffle() {
        const priceFeedTestnet = await PriceFeedTestnet.new()
        const sortedTroves = await SortedTroves.new()
        const troveManager = await TroveManager.new()
        const activePool = await ActivePool.new()
        const stabilityPool = await StabilityPool.new()
        const gasPool = await GasPool.new()
        const defaultPool = await DefaultPool.new()
        const collSurplusPool = await CollSurplusPool.new()
        const functionCaller = await FunctionCaller.new()
        const borrowerOperations = await BorrowerOperations.new()
        const hintHelpers = await HintHelpers.new()
        const zkusdToken = await ZKUSDToken.new(
            troveManager.address,
            stabilityPool.address,
            borrowerOperations.address
        )
        const coreContracts = {
            priceFeedTestnet,
            zkusdToken,
            sortedTroves,
            troveManager,
            activePool,
            stabilityPool,
            gasPool,
            defaultPool,
            collSurplusPool,
            functionCaller,
            borrowerOperations,
            hintHelpers
        }
        return coreContracts
    }

    static async deployZKTContractsTruffle(bountyAddress, lpRewardsAddress, multisigAddress) {
        const zktStaking = await zktStaking.new()
        const lockupContractFactory = await LockupContractFactory.new()
        const communityIssuance = await CommunityIssuance.new()

        /* Deploy ZKT Token, passing Community Issuance,  ZKTStaking, and Factory addresses
        to the constructor  */
        const zkToken = await ZKToken.new(
            communityIssuance.address,
            zktStaking.address,
            lockupContractFactory.address,
            bountyAddress,
            lpRewardsAddress,
            multisigAddress
        )

        const ZKTContracts = {
            zktStaking,
            lockupContractFactory,
            communityIssuance,
            zkToken
        }
        return ZKTContracts
    }

    static async deployZKUSDToken(contracts) {
        contracts.zkusdToken = await ZKUSDToken.new(
            contracts.troveManager.address,
            contracts.stabilityPool.address,
            contracts.borrowerOperations.address
        )
        return contracts
    }

    static async deployZKUSDTokenTester(contracts) {
        contracts.zkusdToken = await ZKUSDTokenTester.new(
            contracts.troveManager.address,
            contracts.stabilityPool.address,
            contracts.borrowerOperations.address
        )
        return contracts
    }

    static async deployProxyScripts(contracts, ZKTContracts, owner, users) {
        const proxies = await buildUserProxies(users)

        const borrowerWrappersScript = await BorrowerWrappersScript.new(
            contracts.borrowerOperations.address,
            contracts.troveManager.address,
            ZKTContracts.zktStaking.address
        )
        contracts.borrowerWrappers = new BorrowerWrappersProxy(owner, proxies, borrowerWrappersScript.address)

        const borrowerOperationsScript = await BorrowerOperationsScript.new(contracts.borrowerOperations.address)
        contracts.borrowerOperations = new BorrowerOperationsProxy(owner, proxies, borrowerOperationsScript.address, contracts.borrowerOperations)

        const troveManagerScript = await TroveManagerScript.new(contracts.troveManager.address)
        contracts.troveManager = new TroveManagerProxy(owner, proxies, troveManagerScript.address, contracts.troveManager)

        const stabilityPoolScript = await StabilityPoolScript.new(contracts.stabilityPool.address)
        contracts.stabilityPool = new StabilityPoolProxy(owner, proxies, stabilityPoolScript.address, contracts.stabilityPool)

        contracts.sortedTroves = new SortedTrovesProxy(owner, proxies, contracts.sortedTroves)

        const zkusdTokenScript = await TokenScript.new(contracts.zkusdToken.address)
        contracts.zkusdToken = new TokenProxy(owner, proxies, zkusdTokenScript.address, contracts.zkusdToken)

        const zkTokenScript = await TokenScript.new(ZKTContracts.zkToken.address)
        ZKTContracts.zkToken = new TokenProxy(owner, proxies, zkTokenScript.address, ZKTContracts.zkToken)

        const zktStakingScript = await ZKTStakingScript.new(ZKTContracts.zktStaking.address)
        ZKTContracts.zktStaking = new ZKTStakingProxy(owner, proxies, zktStakingScript.address, ZKTContracts.zktStaking)
    }

    // Connect contracts to their dependencies
    static async connectCoreContracts(contracts, ZKTContracts) {

        // set TroveManager addr in SortedTroves
        await contracts.sortedTroves.setParams(
            maxBytes32,
            contracts.troveManager.address,
            contracts.borrowerOperations.address
        )

        // set contract addresses in the FunctionCaller
        await contracts.functionCaller.setTroveManagerAddress(contracts.troveManager.address)
        await contracts.functionCaller.setSortedTrovesAddress(contracts.sortedTroves.address)

        // set contracts in the Trove Manager
        await contracts.troveManager.setAddresses(
            contracts.borrowerOperations.address,
            contracts.activePool.address,
            contracts.defaultPool.address,
            contracts.stabilityPool.address,
            contracts.gasPool.address,
            contracts.collSurplusPool.address,
            contracts.priceFeedTestnet.address,
            contracts.zkusdToken.address,
            contracts.sortedTroves.address,
            ZKTContracts.zkToken.address,
            ZKTContracts.zktStaking.address
        )

        // set contracts in BorrowerOperations
        await contracts.borrowerOperations.setAddresses(
            contracts.troveManager.address,
            contracts.activePool.address,
            contracts.defaultPool.address,
            contracts.stabilityPool.address,
            contracts.gasPool.address,
            contracts.collSurplusPool.address,
            contracts.priceFeedTestnet.address,
            contracts.sortedTroves.address,
            contracts.zkusdToken.address,
            ZKTContracts.zktStaking.address
        )

        const accounts = await web3.eth.getAccounts()
        // set contracts in the Pools
        await contracts.stabilityPool.setAddresses(
            contracts.borrowerOperations.address,
            contracts.troveManager.address,
            contracts.activePool.address,
            contracts.zkusdToken.address,
            contracts.sortedTroves.address,
            contracts.priceFeedTestnet.address,
            ZKTContracts.communityIssuance.address,
            accounts[10]
        )

        await contracts.activePool.setAddresses(
            contracts.borrowerOperations.address,
            contracts.troveManager.address,
            contracts.stabilityPool.address,
            contracts.defaultPool.address
        )

        await contracts.defaultPool.setAddresses(
            contracts.troveManager.address,
            contracts.activePool.address,
        )

        await contracts.collSurplusPool.setAddresses(
            contracts.borrowerOperations.address,
            contracts.troveManager.address,
            contracts.activePool.address,
        )

        // set contracts in HintHelpers
        await contracts.hintHelpers.setAddresses(
            contracts.sortedTroves.address,
            contracts.troveManager.address
        )
    }

    static async connectZKTContracts(ZKTContracts) {
        // Set ZKToken address in LCF
        await ZKTContracts.lockupContractFactory.setZKTokenAddress(ZKTContracts.zkToken.address)
    }

    static async connectZKTContractsToCore(ZKTContracts, coreContracts) {
        await ZKTContracts.zktStaking.setAddresses(
            ZKTContracts.zkToken.address,
            coreContracts.zkusdToken.address,
            coreContracts.troveManager.address,
            coreContracts.borrowerOperations.address,
            coreContracts.activePool.address
        )

        await ZKTContracts.communityIssuance.setAddresses(
            ZKTContracts.zkToken.address,
            coreContracts.stabilityPool.address
        )
    }

    static async connectUnipool(uniPool, ZKTContracts, uniswapPairAddr, duration) {
        await uniPool.setParams(ZKTContracts.zkToken.address, uniswapPairAddr, duration)
    }
}

module.exports = DeploymentHelper
