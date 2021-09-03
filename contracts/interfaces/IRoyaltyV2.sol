// SPDX-License-Identifier: MIT
// Based on https://github.com/rariblecom/protocol-contracts/tree/master/royalties
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

interface IRoyaltyV2 is IERC165 {
  struct Royalty {
    address payable account;
    uint96 value;
  }

  event RoyaltiesSet(uint256 tokenId, Royalty[] royalties);

  function getRoyalties(uint256 id) external view returns (Royalty[] memory);
}
