// SPDX-License-Identifier: MIT
// From: https://etherscan.io/address/0xa26e15c895efc0616177b7c1e7270a4c7d51c997#code
/**
 *Submitted for verification at Etherscan.io on 2018-06-22
 */

// proxy.sol - execute actions atomically through the proxy's identity

// Copyright (C) 2017  DappHub, LLC

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

pragma solidity ^0.8.0;

interface DSAuthority {
    function canCall(
        address src,
        address dst,
        bytes4 sig
    ) external view returns (bool);
}

interface DSAuthEvents {
    event LogSetAuthority(address indexed authority);
    event LogSetOwner(address indexed owner);
}

contract DSAuth is DSAuthEvents {
    DSAuthority public authority;
    address public owner;

    constructor() {
        owner = msg.sender;
        emit LogSetOwner(msg.sender);
    }

    function setOwner(address owner_) public {
        require(isAuthorized(msg.sender, msg.sig), "DSAuth: NOT_AUTHORIZED");
        owner = owner_;
        emit LogSetOwner(owner);
    }

    function setAuthority(DSAuthority authority_) public {
        require(isAuthorized(msg.sender, msg.sig), "DSAuth: NOT_AUTHORIZED");
        authority = authority_;
        emit LogSetAuthority(address(authority));
    }

    function isAuthorized(
        address src,
        bytes4 sig
    ) internal view returns (bool) {
        if (src == address(this)) {
            return true;
        } else if (src == owner) {
            return true;
        } else if (address(authority) == address(0)) {
            return false;
        } else {
            return authority.canCall(src, address(this), sig);
        }
    }
}

interface DSNote {
    event LogNote(
        bytes4 indexed sig,
        address indexed guy,
        bytes32 indexed foo,
        bytes32 indexed bar,
        uint wad,
        bytes fax
    ) anonymous;
}

contract DSProxy is DSAuth, DSNote {
    DSProxyCache public cache;

    constructor(address _cacheAddr) {
        require(_cacheAddr != address(0), "DSProxy: INVALID_CACHE_ADDRESS");
        cache = DSProxyCache(_cacheAddr);
    }

    function execute(
        bytes memory _code,
        bytes memory _data
    ) public payable returns (address target, bytes32 response) {
        target = cache.read(_code);
        if (target == address(0)) {
            target = cache.write(_code);
        }

        response = _execute(target, _data);
    }

    function _execute(
        address _target,
        bytes memory _data
    ) internal returns (bytes32 response) {
        require(_target != address(0), "DSProxy: INVALID_TARGET");

        (bool success, bytes memory returnData) = _target.delegatecall(_data);
        require(success, "DSProxy: DELEGATECALL_FAILED");

        assembly {
            response := mload(add(returnData, 0x20))
        }
    }

    function setCache(address _cacheAddr) public returns (bool) {
        require(_cacheAddr != address(0), "DSProxy: INVALID_CACHE_ADDRESS");
        cache = DSProxyCache(_cacheAddr);
        return true;
    }
}

contract DSProxyFactory {
    event Created(
        address indexed sender,
        address indexed owner,
        address proxy,
        address cache
    );

    mapping(address => bool) public isProxy;
    DSProxyCache public cache;

    constructor() {
        cache = new DSProxyCache();
    }

    function build() external returns (DSProxy proxy) {
        proxy = build(msg.sender);
    }

    function build(address owner) public returns (DSProxy proxy) {
        proxy = new DSProxy(address(cache));
        emit Created(msg.sender, owner, address(proxy), address(cache));
        proxy.setOwner(owner);
        isProxy[address(proxy)] = true;
    }
}

contract DSProxyCache {
    mapping(bytes32 => address) public cache;

    function read(bytes memory _code) public view returns (address) {
        bytes32 hash = keccak256(_code);
        return cache[hash];
    }

    function write(bytes memory _code) public returns (address target) {
        bytes32 hash = keccak256(_code);
        target = create(_code);
        cache[hash] = target;
    }

    function create(bytes memory _code) internal returns (address addr) {
        assembly {
            addr := create2(0, add(_code, 0x20), mload(_code), 0)
        }

        require(addr != address(0), "DSProxyCache: CONTRACT_CREATION_FAILED");
    }
}
