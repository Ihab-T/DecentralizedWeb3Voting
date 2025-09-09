// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract ConstructionMilestones {
    address public oracle;

    mapping(bytes32 => uint8) public stageOf;

    event StageUpdated(bytes32 indexed elementId, uint8 indexed stage, address indexed updater, uint256 timestamp);
    event OracleChanged(address indexed oldOracle, address indexed newOracle);

    modifier onlyOracle() {
        require(msg.sender == oracle, "Not authorized");
        _;
    }

    constructor(address _oracle) {
        require(_oracle != address(0), "Zero oracle");
        oracle = _oracle;
        emit OracleChanged(address(0), _oracle);
    }

    function setStage(bytes32 elementId, uint8 newStage) external onlyOracle {
        stageOf[elementId] = newStage;
        emit StageUpdated(elementId, newStage, msg.sender, block.timestamp);
    }

    function setOracle(address newOracle) external onlyOracle {
        require(newOracle != address(0), "Zero oracle");
        emit OracleChanged(oracle, newOracle);
        oracle = newOracle;
    }

    function idFromString(string calldata s) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(s));
    }
}
