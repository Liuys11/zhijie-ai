import { ChangeEvent, FormEvent, useState } from "react";
import { ImagePlus, UserRound, X } from "lucide-react";
import type { UserProfile } from "./types";

type ProfileModalProps = {
  draftProfile: UserProfile;
  previewAvatarUrl: string;
  selectedAvatarName: string;
  isSaving: boolean;
  status: "idle" | "success" | "error";
  error: string;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  onProfileChange: (profile: UserProfile) => void;
  onAvatarSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  onAvatarClear: () => void;
};

export function ProfileModal({
  draftProfile,
  previewAvatarUrl,
  selectedAvatarName,
  isSaving,
  status,
  error,
  onClose,
  onSubmit,
  onProfileChange,
  onAvatarSelect,
  onAvatarClear
}: ProfileModalProps) {
  const initial = (draftProfile.nickname || "学").slice(0, 1).toUpperCase();
  const [failedAvatarUrl, setFailedAvatarUrl] = useState("");
  const avatarUrl = previewAvatarUrl || draftProfile.avatarUrl;
  const showAvatarImage = avatarUrl && failedAvatarUrl !== avatarUrl;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="modal profile-modal" onSubmit={onSubmit} onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="关闭个人资料设置">
          <X size={18} />
        </button>
        <div className="modal-icon">
          <UserRound size={24} />
        </div>
        <h2>个人资料</h2>
        <p>设置一个更像自己的昵称和头像，知界 AI 会在学习空间里使用它。</p>

        <div className="profile-preview">
          {showAvatarImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" onError={() => setFailedAvatarUrl(avatarUrl)} />
          ) : (
            <span>{initial}</span>
          )}
          <div>
            <strong>{draftProfile.nickname || "学习者"}</strong>
            <small>{selectedAvatarName || (draftProfile.avatarUrl ? "当前图片头像" : "使用首字母头像")}</small>
          </div>
        </div>

        <label className="avatar-picker">
          头像
          <span>
            <ImagePlus size={17} />
            选择图片
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onAvatarSelect} disabled={isSaving} />
          </span>
        </label>
        {selectedAvatarName && (
          <button className="avatar-clear" type="button" onClick={onAvatarClear} disabled={isSaving}>
            取消本次选择
          </button>
        )}

        <label>
          昵称
          <input
            value={draftProfile.nickname}
            onChange={(event) => onProfileChange({ ...draftProfile, nickname: event.target.value })}
            placeholder="例如：雨山"
            minLength={2}
            maxLength={30}
            disabled={isSaving}
          />
        </label>

        {error && <p className={`profile-message ${status}`}>{error}</p>}

        <button className="modal-submit" type="submit" disabled={isSaving}>
          {isSaving ? "保存中..." : "保存资料"}
        </button>
      </form>
    </div>
  );
}
