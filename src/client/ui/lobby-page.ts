export interface LobbyPage {
  hide: () => void
  show: () => void
  setBusy: (isBusy: boolean) => void
  setStatus: (text: string) => void
  setInviteCode: (inviteCode: string) => void
  getInviteCode: () => string
  setCopyVisible: (isVisible: boolean) => void
  onCreate: (callback: () => void) => void
  onJoin: (callback: (inviteCode: string) => void) => void
  onCopyInvite: (callback: () => void) => void
}

function mustGetElementById<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing required element #${id}`)
  }

  return element as T
}

export function createLobbyPage(): LobbyPage {
  const lobby = mustGetElementById<HTMLElement>('lobby')
  const codeInput = mustGetElementById<HTMLInputElement>('invite-code')
  const createButton = mustGetElementById<HTMLButtonElement>('create-game')
  const joinButton = mustGetElementById<HTMLButtonElement>('join-game')
  const copyButton = mustGetElementById<HTMLButtonElement>('copy-invite')
  const status = mustGetElementById<HTMLParagraphElement>('lobby-status')

  return {
    hide: () => {
      lobby.style.display = 'none'
    },
    show: () => {
      lobby.style.display = 'grid'
    },
    setBusy: (isBusy: boolean) => {
      codeInput.disabled = isBusy
      createButton.disabled = isBusy
      joinButton.disabled = isBusy
    },
    setStatus: (text: string) => {
      status.textContent = text
    },
    setInviteCode: (inviteCode: string) => {
      codeInput.value = inviteCode
    },
    getInviteCode: () => codeInput.value,
    setCopyVisible: (isVisible: boolean) => {
      copyButton.hidden = !isVisible
    },
    onCreate: (callback: () => void) => {
      createButton.addEventListener('click', callback)
    },
    onJoin: (callback: (inviteCode: string) => void) => {
      joinButton.addEventListener('click', () => {
        callback(codeInput.value)
      })
    },
    onCopyInvite: (callback: () => void) => {
      copyButton.addEventListener('click', callback)
    },
  }
}
