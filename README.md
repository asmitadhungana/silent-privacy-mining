# Silent PMC Operations Manual

## Setup:

Install all the dependencies
Backend:

```
    $ yarn  install
```

Frontend:

```
    $ cd frontend && yarn install
```

#### Echidna:

Step 1: Install solc-select

```
    $ pip3 install solc-select
```

Step 2: Select the solidity version to use

```
    $ solc-select install 0.8.4
    $ solc-select use 0.8.4
```

Step 3: Install [`echidna`](https://github.com/crytic/echidna) using homebrew.

```
    $ brew install echidna
```

Or install the pre-built [`eth-security-toolbox`](https://github.com/trailofbits/eth-security-toolbox) docker container and run it

```
    $ docker pull trailofbits/eth-security-toolbox
    $ docker run -it trailofbits/eth-security-toolbox
    $ docker run --rm -it -v `pwd`:/src ghcr.io/crytic/echidna/echidna
```

---

**Deployments**

To deploy the contracts and conduct setup using hardhat-deploy plugin via deploy/ scripts:

```
    $ yarn deploy:with-setup
```

---

**Test contracts:**

1. Run Smart Contracts Unit tests:

```
    $ yarn test:unit-sc
```

2. Run Echidna Fuzz tests
   Note: You must have echidna pre-installed in your local machine to run the following command or should be running the

```
    $ yarn test:echidna
```

---

**2. Run scripts:**

```
    $ yarn hardhat --network <networkName> run scripts/<script_file>
```
