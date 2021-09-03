// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "./RoyaltyV2.sol";

contract ERC721RoyaltyV2 is ERC721, RoyaltyV2, Ownable {
  using Counters for Counters.Counter;

  Counters.Counter private _tokenIdCounter;

  mapping(uint256 => Royalty) internal _royalties;

  constructor() ERC721("ERC721RoyaltyV2", "TEST") {}

  function safeMint(address to, uint96 royaltyBps) public onlyOwner {
    _tokenIdCounter.increment();
    uint256 _tokenId = _tokenIdCounter.current();
    _safeMint(to, _tokenId);
    _royalties[_tokenId] = Royalty(payable(address(to)), royaltyBps);
  }

  /// @dev Dumb implementation
  function getRoyalties(uint256 id)
    public
    view
    override
    returns (Royalty[] memory)
  {
    Royalty[] memory result = new Royalty[](1);
    Royalty memory royalty = _royalties[id];
    result[0] = royalty;
    return result;
  }

  function supportsInterface(bytes4 interfaceId)
    public
    view
    override(ERC721, RoyaltyV2)
    returns (bool)
  {
    return super.supportsInterface(interfaceId);
  }
}
