import petMascot from "../../../../resources/pet-mascot.png";

export type PetMood = "idle" | "thinking" | "success";

/**
 * 看板娘趴姿小人，带待机动画与表情状态联动。
 * - idle：呼吸 + 轻微浮动
 * - thinking：思考中，轻微晃动 + 「…」气泡
 * - success：报价成功，轻快弹跳 + 「✓」气泡
 * 状态由调用方传入（如工作台的 busy/核价完成、对话页的 busy）。
 */
export function PetMascot({ mood = "idle" }: { mood?: PetMood }) {
  return (
    <span className="pet-mascot-stage">
      {mood === "thinking" && (
        <span className="pet-status-bubble pet-thinking-dots" role="status" aria-label="正在思考">
          <span>·</span>
          <span>·</span>
          <span>·</span>
        </span>
      )}
      {mood === "success" && (
        <span className="pet-status-bubble" role="status" aria-label="报价成功">
          ✓
        </span>
      )}
      <img
        className="pet-mascot"
        data-mood={mood}
        src={petMascot}
        alt="报价助手趴在对话旁"
        aria-hidden="true"
      />
    </span>
  );
}
