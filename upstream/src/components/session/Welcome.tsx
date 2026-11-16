import { openSettings } from '../settings/settingsDialogState.js'
import { openMobilePanel } from '../../mobile/state.js'
import { useIsMobile } from '../../app/viewport.js'
import { useTranslate } from '../../i18n/index.js'
import { ChatInput } from '../chatInput/ChatInput.js'
import { MobileHeader } from './MobileHeader.js'
import styles from './Welcome.module.css'

/** 新对话：问候语 + 输入框。桌面端居中；移动端输入框吸底 */
export const Welcome = () => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  return (
    <div className={styles.container}>
      {isMobile ? <MobileHeader /> : null}
      <div className={styles.welcome}>
        <div className="ds-welcome">
          <div className="ds-logo">ds</div>
          <h1>灵感，从这里开始</h1>
          <p>
            一个安静的空间，留给你的想法。
            <br />
            DeepSeek 与 Gemini，随时切换。
          </p>
          <div className="ds-shortcuts">
            <button onClick={() => openMobilePanel('projects')}>▦ 项目空间</button>
            <button onClick={() => openMobilePanel('plugins')}>⌘ 连接插件</button>
            <button onClick={() => openSettings('data')}>导入 DeepSeek ZIP</button>
            <button onClick={() => openMobilePanel('documents')}>▤ 制作文档</button>
          </div>
        </div>
        <ChatInput sessionId={null} />
        {isMobile ? <div className={styles.caveat}>{t('contentCaveat')}</div> : null}
      </div>
    </div>
  )
}
