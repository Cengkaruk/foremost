// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "../interfaces/IRoyaltyV1.sol";

abstract contract RoyaltyV1 is ERC165, IRoyaltyV1 {
  /*
   * bytes4(keccak256('getFeeBps(uint256)')) == 0x0ebd4c7f
   * bytes4(keccak256('getFeeRecipients(uint256)')) == 0xb9c4d9fb
   *
   * => 0x0ebd4c7f ^ 0xb9c4d9fb == 0xb7799584
   */
  bytes4 private constant _INTERFACE_ID_FEES = 0xb7799584;

  /**
   * @dev See {IERC165-supportsInterface}.
   */
  function supportsInterface(bytes4 interfaceId)
    public
    view
    virtual
    override(IERC165, ERC165)
    returns (bool)
  {
    // FIXME: Hardcoded instead of using type(IRoyaltyV1.interfaceId)
    return
      interfaceId == _INTERFACE_ID_FEES || super.supportsInterface(interfaceId);
  }
}
