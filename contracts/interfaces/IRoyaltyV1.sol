// SPDX-License-Identifier: MIT
// Based on https://github.com/rariblecom/protocol-contracts/tree/master/royalties
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

interface IRoyaltyV1 is IERC165 {
  event SecondarySaleFees(uint256 tokenId, address[] recipients, uint256[] bps);

  function getFeeRecipients(uint256 id)
    external
    view
    returns (address payable[] memory);

  function getFeeBps(uint256 id) external view returns (uint256[] memory);
}
