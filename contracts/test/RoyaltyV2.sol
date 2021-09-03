// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "../interfaces/IRoyaltyV2.sol";

abstract contract RoyaltyV2 is ERC165, IRoyaltyV2 {
  /*
   * bytes4(keccak256('getRoyalties(LibAsset.AssetType)')) == 0x44c74bcc
   */
  bytes4 constant _INTERFACE_ID_ROYALTIES = 0x44c74bcc;

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
    // FIXME: Hardcoded instead of using type(IRoyaltyV2.interfaceId)
    return
      interfaceId == _INTERFACE_ID_ROYALTIES ||
      super.supportsInterface(interfaceId);
  }
}
