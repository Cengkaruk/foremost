// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

contract ERC721Bad {
  function supportsInterface(bytes4 _interface) public returns (bool) {
    return false;
  }
}
