import { FormEvent, useState } from "react";
import { UserRound, X } from "lucide-react";
import type { UserProfile } from "./types";

type ProfileModalProps = {
  draftProfile: UserProfile;
  isSaving: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  onProfileChange: (profile: UserProfile) => void;
};

export function ProfileModal({ draftProfile, isSaving, error, onClose, onSubmit, onProfileChange }: ProfileModalProps) {
  const initial = (draftProfile.nickname || "学").slice(0, 1).toUpperCase();
  const [failedAvatarUrl, setFailedAvatarUrl] = useState("");
  const showAvatarImage = draftProfile.avatarUrl && failedAvatarUrl !== draftProfile.avatarUrl;

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
            <img src={draftProfile.avatarUrl} alt="" onError={() => setFailedAvatarUrl(draftProfile.avatarUrl)} />
          ) : (
            <span>{initial}</span>
          )}
          <div>
            <strong>{draftProfile.nickname || "学习者"}</strong>
            <small>{draftProfile.avatarUrl ? "使用图片头像" : "使用首字母头像"}</small>
          </div>
        </div>

        <label>
          昵称
          <input
            value={draftProfile.nickname}
            onChange={(event) => onProfileChange({ ...draftProfile, nickname: event.target.value })}
            placeholder="例如：雨山"
            maxLength={32}
          />
        </label>

        <label>
          头像 URL
          <input
            value={draftProfile.avatarUrl}
            onChange={(event) => onProfileChange({ ...draftProfile, avatarUrl: event.target.value })}
            placeholder="https://example.com/avatar.png"
          />
        </label>

        {error && <p className="profile-error">{error}</p>}

        <button className="modal-submit" type="submit" disabled={isSaving}>
          {isSaving ? "保存中..." : "保存资料"}
        </button>
      </form>
    </div>
  );
}
