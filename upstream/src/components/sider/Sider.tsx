import { MobileNav } from '../../mobile/MobileHub.js'
import { useMobile } from '../../mobile/state.js'
import clsx from 'clsx'
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { IconPanelLeftOutline16, IconSettingsOutline16, NewChatIcon } from '../base/icons.js'
import { setSiderCollapsed } from '../../services/settings.js'
import { groupSessions } from '../../services/chat/sessionGroups.js'
import { newChat, removeSession, useChatStore } from '../../services/chat/store.js'
import type { SessionSummary } from '../../services/chat/types.js'
import { Button } from '../base/Button.js'
import { IconButton } from '../base/IconButton.js'
import { Modal } from '../base/Modal.js'
import { showToast } from '../base/toastState.js'
import { openSettings } from '../settings/settingsDialogState.js'
import { closeMobileSider, mobileSiderId, useMobileSider } from './mobileSiderState.js'
import { SessionItem } from './SessionItem.js'
import styles from './Sider.module.css'

/** 展开的侧边栏：名称与收起按钮、开启新对话、按时间分组的会话列表、底部设置；移动端放在抽屉里，收起按钮关闭抽屉 */
export const Sider = memo(function Sider({ mobile = false }: { mobile?: boolean }) {
  const t = useTranslate()
  const sessions = useChatStore((state) => state.sessions)
  const activeId = useChatStore((state) => state.activeId)
  const [now, setNow] = useState(Date.now)
  const selected = useMobile((s) => s.selected)
  const assignments = useMobile((s) => s.assignments)
  const groups = useMemo(
    () =>
      groupSessions(
        selected ? sessions.filter((s) => assignments[s.id] === selected) : sessions,
        now,
        t
      ),
    [sessions, now, t, selected, assignments]
  )
  const [deleting, setDeleting] = useState<SessionSummary | null>(null)
  const [deletePending, setDeletePending] = useState(false)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const refresh = () => {
      clearTimeout(timer)
      const time = Date.now()
      setNow(time)
      const midnight = new Date(time).setHours(24, 0, 0, 0)
      timer = setTimeout(refresh, midnight - time)
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh()
      }
    }
    refresh()
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', refresh)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  return (
    <div className={clsx(styles.sider, mobile && styles.mobile)}>
      <div className={styles.top}>
        <div className={styles.appName}>{t('appName')}</div>
        <IconButton
          size="m"
          icon={<IconPanelLeftOutline16 />}
          tooltip={t('collapseSiderbarButton')}
          tooltipPlacement="bottom"
          onClick={() => (mobile ? closeMobileSider() : setSiderCollapsed(true))}
        />
      </div>
      <button
        type="button"
        className={styles.newChat}
        onClick={() => {
          newChat()
          closeMobileSider()
        }}
      >
        <span className={styles.newChatIcon}>
          <NewChatIcon />
        </span>
        {t('newChat')}
      </button>
      <MobileNav />
      <div className={styles.listWrap}>
        <div className={styles.list}>
          {groups.map((group) => (
            <div key={group.key} className={styles.section}>
              <div className={styles.sectionHeader}>{group.label}</div>
              {group.sessions.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  active={session.id === activeId}
                  onDelete={() => setDeleting(session)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className={styles.bottom}>
        <button type="button" className={styles.settings} onClick={() => openSettings('general')}>
          <span className={styles.settingsIcon}>
            <IconSettingsOutline16 />
          </span>
          <span className={styles.settingsLabel}>{t('settings')}</span>
        </button>
      </div>
      {deleting ? (
        <Modal
          title={t('deleteSessionModalContentTitle')}
          onClose={() => {
            if (!deletePending) {
              setDeleting(null)
            }
          }}
          footer={
            <>
              <Button variant="outlined" disabled={deletePending} onClick={() => setDeleting(null)}>
                {t('cancel')}
              </Button>
              <Button
                variant="danger"
                disabled={deletePending}
                onClick={async () => {
                  setDeletePending(true)
                  try {
                    if (await removeSession(deleting.id)) {
                      setDeleting(null)
                    } else {
                      showToast({ key: 'sessionDeleteFailed', type: 'error' })
                    }
                  } finally {
                    setDeletePending(false)
                  }
                }}
              >
                {t('delete')}
              </Button>
            </>
          }
        >
          {t('deleteSessionWithFilesDescription')}
        </Modal>
      ) : null}
    </div>
  )
})

/** 保留抽屉及其滚动位置，让关闭动画和快速反向切换都能连续播放。 */
export const MobileSider = ({ contentRef }: { contentRef: RefObject<HTMLElement> }) => {
  const t = useTranslate()
  const open = useMobileSider((state) => state.open)
  const drawerRef = useRef<HTMLElement>(null)
  const wasOpen = useRef(false)

  useLayoutEffect(() => {
    const drawer = drawerRef.current
    if (!drawer) {
      return
    }
    const restoreFocus = wasOpen.current && !open
    wasOpen.current = open
    drawer.inert = !open
    const content = contentRef.current
    if (!content) {
      return
    }
    content.inert = open
    if (open) {
      drawer.focus({ preventScroll: true })
    } else if (
      restoreFocus &&
      (drawer.contains(document.activeElement) || document.activeElement === document.body)
    ) {
      content
        .querySelector<HTMLButtonElement>(`button[aria-controls="${mobileSiderId}"]`)
        ?.focus({ preventScroll: true })
    }
    return () => {
      content.inert = false
    }
  }, [contentRef, open])

  useEffect(() => {
    if (!open) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) {
        return
      }
      // 弹窗和会话菜单位于抽屉上方，由它们先响应返回键。
      if (document.querySelector(`[role="dialog"]:not(#${mobileSiderId}), [role="menu"]`)) {
        return
      }
      closeMobileSider()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <div className={styles.drawerLayer} data-open={open}>
      <div className={styles.drawerMask} aria-hidden="true" onClick={closeMobileSider} />
      <aside
        ref={drawerRef}
        id={mobileSiderId}
        className={styles.drawer}
        tabIndex={-1}
        role={open ? 'dialog' : undefined}
        aria-modal={open || undefined}
        aria-label={t('appName')}
      >
        <Sider mobile />
      </aside>
    </div>
  )
}
