// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// V4: добавили info(...) и setStageWithNote(...).
/// ПОРЯДОК/ИМЕНА/ТИПЫ переменных ниже — строго такие же, как в V3.
/// __gap оставляем тем же и на том же месте!
contract ConstructionMilestonesV4Upgradeable is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    // ==== ХРАНИМ ТОЧНО КАК В V3 ====
    address public oracle;

    // !!! Если в V3 было _stageOf — здесь тоже оставьте _stageOf.
    mapping(bytes32 => uint8) public _stageOf;

    mapping(bytes32 => string) public noteOf;
    mapping(bytes32 => uint256) public updatedAt;

    // <<< зарезервированное место (размер ДОЛЖЕН совпадать с V3) >>>
    uint256[47] private __gap; // <-- если в V3 не 47, подставьте ваш размер

    // ==== События/модификаторы (как в V3) ====
    event StageUpdated(bytes32 indexed elementId, uint8 stage, address indexed updater, uint256 ts);
    event OracleChanged(address indexed oldOracle, address indexed newOracle);

    modifier onlyOracle() {
        require(msg.sender == oracle, "Not authorized");
        _;
    }

    // Инициализация (как в V3)
    function initialize(address _oracle) public initializer {
        require(_oracle != address(0), "Zero oracle");
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        oracle = _oracle;
        emit OracleChanged(address(0), _oracle);
    }

    // Из V3 — номер занят, оставляем пустым
    function initializeV3() public reinitializer(3) {}

    // Маркер V4 (можно не вызывать)
    function initializeV4() public reinitializer(4) {}

    // UUPS защита
    function _authorizeUpgrade(address) internal override onlyOwner {}

    // Базовая логика (как в V3)
    function setStage(bytes32 elementId, uint8 newStage) external onlyOracle {
        _stageOf[elementId]   = newStage;
        updatedAt[elementId] = block.timestamp;
        emit StageUpdated(elementId, newStage, msg.sender, block.timestamp);
    }

    function setNote(bytes32 elementId, string calldata note) external onlyOracle {
        noteOf[elementId] = note;
    }

    // Удобная обёртка: за одну транзакцию и stage, и note
    function setStageWithNote(bytes32 elementId, uint8 newStage, string calldata note) external onlyOracle {
        _stageOf[elementId]   = newStage;
        noteOf[elementId]    = note;
        updatedAt[elementId] = block.timestamp;
        emit StageUpdated(elementId, newStage, msg.sender, block.timestamp);
    }

    // Новый удобный view (именованные return-переменные!)
    function info(bytes32 elementId)
        external
        view
        returns (uint8 stage, uint256 lastUpdate, string memory note)
    {
        stage      = _stageOf[elementId];
        lastUpdate = updatedAt[elementId];
        note       = noteOf[elementId];
    }

    function version() external pure returns (uint256) { return 4; }
}
