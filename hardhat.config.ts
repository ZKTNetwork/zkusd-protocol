import "ts-mocha";
import "hardhat-deploy";
import "hardhat-deploy-ethers";
import "solidity-coverage";
import "typechain"
import "@typechain/hardhat"
import "hardhat-abi-exporter";
import "hardhat-gas-reporter";
import "@nomiclabs/hardhat-etherscan"
import "@matterlabs/hardhat-zksync-chai-matchers";
import "@matterlabs/hardhat-zksync-solc";

import { accountsList } from "./hardhatAccountList2K";
import { account_pk_list} from "./pk_account_list";

const DEFAULT_COMPILER_SETTINGS = {
  version: "0.8.17",
  settings: {
    optimizer: {
      enabled: true,
      runs: 500,
    },
    metadata: {
      bytecodeHash: "none",
    },
  },
};

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const config =  {
  solidity: {
    compilers: [DEFAULT_COMPILER_SETTINGS],
  },
  zksolc: {
    version: "1.3.5",
    compilerSource: "binary",
    settings: {
      compilerPath: "zksolc/zksolc-macosx-amd64-v1.3.5",
      isSystem: true,
    },
  },
  paths: {
    deployments: "deployments",
  },
  namedAccounts: {
    deployer: 0,
  },
  networks: {
    hardhat: {
      accounts: accountsList,
      gas: 10000000, // tx gas limit
      blockGasLimit: 15000000,
      gasPrice: 20000000000,
      initialBaseFeePerGas: 0,
    },
    goerli: {
      url: `https://goerli.infura.io/v3/${process.env.infura_key}`,
      chainId: 5,
      accounts:
        process.env.pk_goerli !== undefined ? [process.env.pk_goerli] : [],
      zksync: false,
    },
    zktest: {
      url: "https://zksync2-testnet.zksync.dev",
      zksync: true,
      accounts:
        process.env.pk_zktest !== undefined ? [process.env.pk_zktest] : [],
      chainId: 280,
    },
    linea: {
      url: `https://linea-mainnet.infura.io/v3/${process.env.linea_key}`,
      chainId: 59140,
      zksync: false,
      accounts:
          process.env.pk_lineatest === undefined
              ? []
              : [process.env.pk_lineatest],
    },
    lineatest: {
      url: "https://rpc.goerli.linea.build",
      chainId: 59140,
      zksync: false,
      accounts:
        process.env.pk_lineatest === undefined
          ? []
          : [process.env.pk_lineatest],
    },
    neondev: {
      url: "https://devnet.neonevm.org",
      chainId: 245022926,
      zksync: false,
      accounts:
          process.env.pk_neondev === undefined
              ? []
              : [process.env.pk_neondev],
    }
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  etherscan: {
    apiKey: {
      neontest: "829c4ad07e7afad498c38a85a41e26b4",
      neondev:"test",
    },
    customChains: [
      {
        network: "neontest",
        chainId: 9559,
        urls: {
          apiURL: "https://testnet-scan.neonlink.io/api",
          browserURL: "https://testnet-scan.neonlink.io"
        },
      },
      {
        network: "neondev",
        chainId: 245022926,
        urls: {
          apiURL: "https://devnet-api.neonscan.org/hardhat/verify",
          browserURL: "https://devnet.neonscan.org"
        }
      }
    ]
  },
  abiExporter: {
    runOnCompile: true,
  },
};

export default config;
