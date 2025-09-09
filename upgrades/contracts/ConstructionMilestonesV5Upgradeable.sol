// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// V5: добавили голосование 3/3 для фиксации стадии (stage=1) по elementId.
/// - фиксированный список из трёх голосующих адресов (voters[3])
/// - один голос на адрес на каждый elementId
/// - засчитываем только "approve=true"
/// - финализация при approvals==3 (ставим stageOf[elementId]=1, пишем updatedAt)
contract ConstructionMilestonesV5Upgradeable is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    // ==== СТАРЫЕ ПЕРЕМЕННЫЕ (сохраняем порядок ровно как было в V3/V4) ====
    address public oracle;
    mapping(bytes32 => uint8)  public _stageOf;
    mapping(bytes32 => string) public noteOf;
    mapping(bytes32 => uint256) public updatedAt;

    // ==== НОВОЕ В V5 (добавляем ТОЛЬКО внизу) ====
    /// три фиксированных голосующих адреса (прораб, технадзор, заказчик)
    address[3] public voters;

    /// сколько "ДА" (approve=true) по данному elementId
    mapping(bytes32 => uint8) public approvals;

    /// кто уже голосовал по elementId (чтобы нельзя было голосовать 2 раза)
    mapping(bytes32 => mapping(address => bool)) public hasVoted;

    // ==== СОБЫТИЯ ====
    event OracleChanged(address indexed oldOracle, address indexed newOracle);
    event Voted(bytes32 indexed elementId, address indexed voter, bool approve, uint8 approvals, uint256 ts);
    event PhaseFinalized(bytes32 indexed elementId, uint8 finalStage, uint256 ts);

    // ==== МОДИФИКАТОРЫ ====
    modifier onlyOracle() {
        require(msg.sender == oracle, "Not authorized");
        _;
    }

    // ==== ИНИЦИАЛИЗАЦИЯ БАЗЫ (как и раньше) ====
    function initialize(address _oracle) public initializer {
        require(_oracle != address(0), "Zero oracle");
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        oracle = _oracle;
        emit OracleChanged(address(0), _oracle);
    }

    // ==== ИНИЦИАЛИЗАТОР V5: передаём 3 адреса голосующих ====
    /// Вызовем один раз при апгрейде прокси на V5.
    function initializeV5(address[3] memory _voters) public reinitializer(5) {
        require(_voters[0] != address(0) && _voters[1] != address(0) && _voters[2] != address(0), "Zero voter");
        voters = _voters;
    }

    // ==== UUPS защита ====
    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ==== СТАРЫЕ АДМИН-ФУНКЦИИ (сохраняем, чтобы не ломать сценарии) ====
    function setOracle(address newOracle) external onlyOwner {
        require(newOracle != address(0), "Zero oracle");
        emit OracleChanged(oracle, newOracle);
        oracle = newOracle;
    }

    /// прямое выставление стадии оракулом (оставляем для обратной совместимости/админа)
    function setStage(bytes32 elementId, uint8 newStage) external onlyOracle {
        _stageOf[elementId] = newStage;
        updatedAt[elementId] = block.timestamp;
        // финализация голосов можно не сбрасывать — в нашей модели одна цель: перевести в 1.
        // Но если хочешь обнулять, раскомментируй:
        // _resetVotes(elementId);
        emit PhaseFinalized(elementId, newStage, block.timestamp);
    }

    function setNote(bytes32 elementId, string calldata note) external onlyOracle {
        noteOf[elementId] = note;
    }

    function version() external pure returns (uint256) { return 5; }

    // ==== ГОЛОСОВАНИЕ 3/3 ====
    function vote(bytes32 elementId, bool approve) external {
        require(_isVoter(msg.sender), "Not a voter");
        require(_stageOf[elementId] == 0, "Already finalized");
        require(!hasVoted[elementId][msg.sender], "Already voted");

        hasVoted[elementId][msg.sender] = true;
        if (approve) {
            // безопасно — максимум три "ДА"
            approvals[elementId] += 1;
        }

        emit Voted(elementId, msg.sender, approve, approvals[elementId], block.timestamp);

        // финализируем только при 3/3 "ДА"
        if (approvals[elementId] == 3) {
            _stageOf[elementId] = 1; // наша целевая стадия
            updatedAt[elementId] = block.timestamp;
            emit PhaseFinalized(elementId, 1, block.timestamp);
        }
    }

    // ==== VIEW-ХЕЛПЕРЫ ====
    function getVoters() external view returns (address, address, address) {
        return (voters[0], voters[1], voters[2]);
    }

    function getVotes(bytes32 elementId)
        external
        view
        returns (uint8 approvalsYes, bool v0, bool v1, bool v2)
    {
        approvalsYes = approvals[elementId];
        v0 = hasVoted[elementId][voters[0]];
        v1 = hasVoted[elementId][voters[1]];
        v2 = hasVoted[elementId][voters[2]];
    }

    // ==== ВНУТРЕННЕЕ ====
    function _isVoter(address a) internal view returns (bool) {
        return (a == voters[0] || a == voters[1] || a == voters[2]);
    }

    function _resetVotes(bytes32 elementId) internal {
        approvals[elementId] = 0;
        if (voters[0] != address(0)) hasVoted[elementId][voters[0]] = false;
        if (voters[1] != address(0)) hasVoted[elementId][voters[1]] = false;
        if (voters[2] != address(0)) hasVoted[elementId][voters[2]] = false;
    }

    // ====== ВАЖНО ПРО __gap ======
    // В V3/4 у тебя, скорее всего, был __gap на 47 слотов.
    // Мы добавили 5 новых слотов (address[3] = 3 слота, + 2 маппинга = 5).
    // Поэтому новый gap = 47 - 5 = 42.
    // Если у тебя в V4 был ДРУГОЙ размер, просто поставь (СТАРЫЙ - 5).
    uint256[42] private __gap;
}
