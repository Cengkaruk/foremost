# Foremost Contracts

> WARNING - ALPHA QUALITY

Market smart contracts for selling and auctioning NFTs. Supports any existing NFTs with ERC721 standard with the newest royalty schema ERC2981 and Rarible's RoyaltyV1 and RoyaltyV2. Supports ERC20 based as a currency for the orders, including ETH via the wrapper.

# Project Goal

Provide an open-source framework for NFTs dapp, so everyone can build their own custom dapp for their existing collections. Imagine a creator on an existing NFT marketplace can build their own shop using their own domain, that's the goal.

Foremost also intended to be a statically generated site framework, so you can host on decentralized storage like IPFS and use ENS/HNS for the domain. But, no problem if you want to host the dapp on a normal hosting.

### Architecture

We will split the project into little parts.

1. Market contract (This repository)
2. Subgraph for indexing and on-chain API
3. Off-chain API for an additional experience like Profile, Notifications, etc
4. SDK for the glue of the contract, subgraph, and off-chain API
5. Specific library/module for frameworks like Vue and React that utilize the SDK
6. Project template for specific frameworks, with complete UI

So the experience for using Foremost is like

1. Using `npx` to initiate a new site with the specific template (choose the framework)
2. Already have UI, with library and the SDK
3. Customize!
4. Deploy

### Contribution

Find this project interesting? Let's have fun together!
