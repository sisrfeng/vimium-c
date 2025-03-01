import {
  needIcon_, cPort, set_cPort, reqH_, contentPayload_, omniPayload_, innerCSS_, extAllowList_, framesForTab_,
  framesForOmni_, getNextFakeTabId, curTabId_, vomnibarPage_f, OnChrome, CurCVer_, OnEdge, setIcon_,
  keyFSM_, mappedKeyRegistry_, CONST_, mappedKeyTypes_, recencyForTab_, setTeeTask_
} from "./store"
import { asyncIter_, getOmniSecret_, keys_ } from "./utils"
import { removeTempTab, tabsGet, runtimeError_, getCurTab, getTabUrl, Tabs_, browserWebNav_, Q_ } from "./browser"
import { exclusionListening_, getExcluded_, exclusionListenHash_ } from "./exclusions"
import { I18nNames, transEx_ } from "./i18n"

const onMessage = <K extends keyof FgReq, T extends keyof FgRes> (request: Req.fg<K> | Req.fgWithRes<T>
    , port: Frames.Port): void => {
  type ReqK = keyof FgReq
  type ResK = keyof FgRes;
  if (request.H !== kFgReq.msg) {
    (reqH_ as {
      [T2 in ReqK]: (req: Req.fg<T2>, port: Frames.Port) => void
    } as {
      [T2 in ReqK]: <T3 extends ReqK>(req: Req.fg<T3>, port: Frames.Port) => void
    })[request.H](request as Req.fg<K>, port)
  } else {
    const ret = (reqH_ as {
        [T2 in ResK]: (req: Req.fgWithRes<T2>["a"], port: Port, msgId: number) => FgRes[T2] | Port
      } as {
        [T2 in ResK]: <T3 extends ResK>(req: Req.fgWithRes<T3>["a"], port: Port, msgId: number) => FgRes[T3] | Port
      })[(request as Req.fgWithRes<T>).c]((request as Req.fgWithRes<T>).a, port, (request as Req.fgWithRes<T>).i)
    ret !== port &&
    port.postMessage<2>({ N: kBgReq.msg, m: (request as Req.fgWithRes<T>).i, r: ret as FgRes[T] })
  }
}

export const sendResponse = <T extends keyof FgRes> (port: Port, msgId: number, response: FgRes[T]): void => {
  const frames = framesForTab_.get(port.s.tabId_)
  if (frames && frames.ports_.includes(port)) { // for less exceptions
    try {
      port.postMessage<2>({ N: kBgReq.msg, m: msgId, r: response })
    } catch {}
  }
}

export const OnConnect = (port: Frames.Port, type: PortType): void => {
  if (type & PortType.selfPages) {
    /*#__NOINLINE__*/ _onPageConnect(port, type)
    return
  }
  const sender = /*#__NOINLINE__*/ formatPortSender(port)
  const url = sender.url_, isOmni = url === vomnibarPage_f
  if (type > PortType.reconnect - 1 || isOmni) {
    if (type === PortType.CloseSelf) {
      sender.tabId_ >= 0 && !sender.frameId_ &&
      removeTempTab(sender.tabId_, (port as Frames.BrowserPort).sender.tab!.windowId, sender.url_)
      return
    } else if (type & PortType.omnibar || isOmni) {
      /*#__NOINLINE__*/ _onOmniConnect(port, type
          , isOmni || url === CONST_.VomnibarPageInner_)
      return
    }
  }
  let tabId = sender.tabId_
  const ref = tabId >= 0 ? framesForTab_.get(tabId)
      : ((tabId = (sender as Writable<Frames.Sender>).tabId_ = getNextFakeTabId()), undefined)
  const isNewFrameInSameTab = (type & (PortType.isTop | PortType.reconnect)) !== PortType.isTop
  let status: Frames.ValidStatus
  let passKeys: null | string, flags: BgReq[kBgReq.reset]["f"]
  if (ref !== undefined && ref.lock_ !== null && isNewFrameInSameTab) {
    passKeys = ref.lock_.passKeys_
    status = ref.lock_.status_
    flags = status === Frames.Status.disabled ? Frames.Flags.lockedAndDisabled : Frames.Flags.locked
  } else {
    passKeys = exclusionListening_ ? getExcluded_(url, sender) : null
    status = passKeys === null ? Frames.Status.enabled : passKeys ? Frames.Status.partial : Frames.Status.disabled
    flags = Frames.Flags.blank
  }
  sender.status_ = status
  if (ref !== undefined && isNewFrameInSameTab) {
    flags |= ref.flags_ & Frames.Flags.userActed
    if (type & PortType.otherExtension) {
      flags |= Frames.Flags.otherExtension
      ref.flags_ |= Frames.Flags.otherExtension
    }
    sender.flags_ = flags
  }
  if (type & PortType.reconnect) {
    sender.flags_ |= PortType.hasCSS === <number> Frames.Flags.hasCSS ? type & PortType.hasCSS
        : (type & PortType.hasCSS) && Frames.Flags.hasCSS
    port.postMessage({ N: kBgReq.reset, p: passKeys, f: flags & Frames.Flags.MASK_LOCK_STATUS })
    // not refresh settings cache in content scripts - no do "unpredictable" work
    port.postMessage({ N: kBgReq.settingsUpdate, d: contentPayload_ })
  } else {
    port.postMessage({
      N: kBgReq.init, f: flags, c: contentPayload_, p: passKeys,
      m: mappedKeyRegistry_, t: mappedKeyTypes_, k: keyFSM_!
    })
  }
  if (!OnChrome) { (port as Frames.BrowserPort).sender.tab = null as never }
  port.onDisconnect.addListener(/*#__NOINLINE__*/ onDisconnect)
  port.onMessage.addListener(/*#__NOINLINE__*/ onMessage)
  if (OnChrome && Build.MinCVer < BrowserVer.MinWithFrameId && CurCVer_ < BrowserVer.MinWithFrameId) {
    (sender as Writable<Frames.Sender>).frameId_ = (type & PortType.isTop) ? 0 : ((Math.random() * 9999997) | 0) + 2
  }
  if (ref !== undefined && isNewFrameInSameTab) {
    if (type & PortType.hasFocus) {
      if (needIcon_ && ref.cur_.s.status_ !== status) {
        setIcon_(tabId, status)
      }
      ref.cur_ = port
    }
    if (type & PortType.isTop && !ref.top_) {
      (ref as Writable<Frames.Frames>).top_ = port
    }
    ref.ports_.push(port)
  } else {
    framesForTab_.set(tabId, {
      cur_: port, top_: type & PortType.isTop ? port : null, ports_: [port],
      lock_: null, flags_: Frames.Flags.Default
    })
    status !== Frames.Status.enabled && needIcon_ && setIcon_(tabId, status)
    if (ref !== undefined) {
      /*#__NOINLINE__*/ revokeOldPorts(ref.ports_) // those in a new page will auto re-connect
    }
  }
}

const onDisconnect = (port: Port): void => {
  let { tabId_: tabId } = port.s, i: number, ref = framesForTab_.get(tabId)
  if (!ref) { return }
  const ports = ref.ports_
  i = ports.lastIndexOf(port)
  if (!port.s.frameId_) {
    i >= 0 && framesForTab_.delete(tabId)
    return
  }
  if (i === ports.length - 1) {
    --ports.length
  } else if (i >= 0) {
    ports.splice(i, 1)
  }
  if (!ports.length) {
    framesForTab_.delete(tabId)
  } else if (port === ref.cur_) {
    ref.cur_ = ports[0]
  }
}

const _onOmniConnect = (port: Frames.Port, type: PortType, isOmniUrl: boolean): void => {
  if (type > PortType.omnibar - 1) {
    if (isOmniUrl) {
      if (port.s.tabId_ < 0) {
        (port.s as Writable<Frames.Sender>).tabId_ = type & PortType.reconnect ? getNextFakeTabId()
            : cPort ? cPort.s.tabId_ : curTabId_
      }
      port.s.flags_ |= Frames.Flags.isVomnibar
      framesForOmni_.push(port)
      if (!OnChrome) { (port as Frames.BrowserPort).sender.tab = null as never }
      port.onDisconnect.addListener(/*#__NOINLINE__*/ onOmniDisconnect)
      port.onMessage.addListener(/*#__NOINLINE__*/ onMessage)
      type & PortType.reconnect ||
      port.postMessage({ N: kBgReq.omni_init, l: omniPayload_, s: getOmniSecret_(false) })
      return
    }
  } else if (port.s.tabId_ < 0 // e.g.: inside a sidebar on MS Edge
      || (OnChrome && Build.MinCVer < BrowserVer.Min$tabs$$executeScript$hasFrameIdArg
          && CurCVer_ < BrowserVer.Min$tabs$$executeScript$hasFrameIdArg)
      || port.s.frameId_ === 0
      ) { /* empty */ }
  else {
    Tabs_.executeScript(port.s.tabId_, {
      file: CONST_.VomnibarScript_, frameId: port.s.frameId_, runAt: "document_start"
    }, runtimeError_)
  }
  port.disconnect()
}

const onOmniDisconnect = (port: Port): void => {
  const ref = framesForOmni_, i = ref.lastIndexOf(port)
  if (i === ref.length - 1) {
    --ref.length
  } else if (i >= 0) {
    ref.splice(i, 1)
  }
}

const _onPageConnect = (port: Port, type: PortType): void => {
  if (type & PortType.otherExtension) {
    port.disconnect()
    return
  }
  (port as Frames.Port).s = false as never
  if (type & PortType.Tee) {
    let taskOnce = setTeeTask_(null, null)
    if (taskOnce && taskOnce.t) {
      taskOnce.d = null
      port.postMessage({ N: kBgReq.omni_runTeeTask, t: taskOnce.t, s: taskOnce.s })
      const callback = (res: any): void => {
        if (taskOnce) {
          clearTimeout(taskOnce.i)
          taskOnce.r && taskOnce.r(res)
        }
        taskOnce = null
      }
      port.onMessage.addListener(callback)
      port.onDisconnect.addListener((): void => { callback(false) })
    } else {
      port.disconnect()
    }
    return
  }
  port.onMessage.addListener(onMessage)
}

const formatPortSender = (port: Port): Frames.Sender => {
  const sender = (port as Frames.BrowserPort).sender
  const tab = sender.tab // || { id: -3, incognito: false }
  if (OnChrome) { sender.tab = null as never }
  return (port as Frames.Port).s = {
    frameId_: sender.frameId || 0, // frameId may not exist if no sender.tab
    status_: Frames.Status.enabled, flags_: Frames.Flags.blank,
    incognito_: tab != null ? tab.incognito : false,
    tabId_: tab != null ? tab.id : -3,
    url_: OnEdge ? sender.url || tab != null && tab.url || "" : sender.url!
  }
}

const revokeOldPorts = (ports_: Frames.Port[]) => {
  for (const port of ports_) {
    if (port.s.frameId_) {
      try {
        port.disconnect()
      } catch {}
    }
  }
}

/**
 * @returns "" - in a child frame, so need to send request to content
 * @returns string - valid URL
 * @returns Promise&lt;string> - valid URL or empty string for a top frame in "port's or the current" tab
 */
export const getPortUrl_ = (port?: Port | null, ignoreHash?: boolean, request?: Req.baseFg<kFgReq>
    ): string | Promise<string> => {
  port = port || framesForTab_.get(curTabId_)?.top_
  return port && exclusionListening_ && (ignoreHash || exclusionListenHash_) ? port.s.url_
      : new Promise<string>((resolve): void => {
    const webNav = !OnEdge && (!OnChrome || Build.MinCVer >= BrowserVer.Min$webNavigation$$getFrame$IgnoreProcessId
            || CurCVer_ > BrowserVer.Min$webNavigation$$getFrame$IgnoreProcessId - 1)
        && port && port.s.frameId_ ? browserWebNav_() : null
    port ? (webNav ? webNav.getFrame : tabsGet as never as typeof chrome.webNavigation.getFrame)(
        webNav ? {tabId: port.s.tabId_, frameId: port.s.frameId_}
          : As_<Parameters<typeof chrome.tabs.get>[0]>(port.s.tabId_) as never,
        (tab?: chrome.webNavigation.GetFrameResultDetails | Tab | null): void => {
      const url = tab ? tab.url : ""
      if (!url && webNav) {
        (request! as unknown as Req.bg<kBgReq.url>).N = kBgReq.url
        safePost(port!, request as Req.bg<kBgReq.url>)
      }
      resolve(url)
      return runtimeError_()
    }) : getCurTab((tabs): void => {
      resolve(tabs && tabs.length ? getTabUrl(tabs[0]) : "")
      return runtimeError_()
    })
  })
}

export const requireURL_ = <k extends keyof FgReq>(request: Req.fg<k> & {u: "url"}, ignoreHash?: true
    ): Promise<string> | void => {
  type T1 = keyof FgReq
  type Req1 = { [K in T1]: (req: FgReq[K], port: Frames.Port) => void }
  type Req2 = { [K in T1]: <T extends T1>(req: FgReq[T], port: Frames.Port) => void }
  set_cPort(cPort || framesForTab_.get(curTabId_)?.top_)
  const res = getPortUrl_(cPort, ignoreHash, request)
  if (typeof res !== "string") {
    return res.then(url => {
      request.u = url as "url"
      url && (reqH_ as Req1 as Req2)[request.H](request, cPort)
      return url
    })
  } else {
    request.u = res as "url"
    (reqH_ as Req1 as Req2)[request.H](request, cPort)
  }
}

export const findCPort = (port: Port | null | undefined): Port | null => {
  const frames = framesForTab_.get(port ? port.s.tabId_ : curTabId_)
  return frames ? frames.cur_ : null as never as Port
}

export const isExtIdAllowed = (sender: chrome.runtime.MessageSender): boolean | string => {
  const extId: string = sender.id != null ? sender.id : "unknown_sender"
  let url: string | undefined = sender.url, tab = sender.tab
  const list = extAllowList_, stat = list.get(extId)
  if (stat !== true && tab) {
    const ref = framesForTab_.get(tab.id), oldInfo = ref ? ref.unknownExt_ : null
    if (ref && (oldInfo == null || oldInfo !== extId && typeof oldInfo === "string")) {
      ref.unknownExt_ = oldInfo == null ? extId : 2
    }
  }
  if (stat != null) { return stat }
  if (url === vomnibarPage_f) { return true }
  if (!OnChrome && stat == null && url) {
    url = new URL(url).host
    if (list.get(url) === true) {
      list.set(extId, true)
      return true
    }
    if (url !== extId) {
      list.set(url, extId)
    }
  }
  const backgroundLightYellow = "background-color:#fffbe5"
  console.log("%cReceive message from an extension/sender not in the allow list: %c%s",
    backgroundLightYellow, backgroundLightYellow + ";color:red", extId)
  list.set(extId, false)
  return false
}

export const indexFrame = (tabId: number, frameId: number): Port | null => {
  const ref = framesForTab_.get(tabId)
  for (const port of ref ? ref.ports_ : []) {
    if (port.s.frameId_ === frameId) {
      return port
    }
  }
  return null
}

export const ensureInnerCSS = (sender: Frames.Sender): string | null => {
  if (sender.flags_ & Frames.Flags.hasCSS) { return null }
  const ref = framesForTab_.get(sender.tabId_)
  ref && (ref.flags_ |= Frames.Flags.userActed)
  sender.flags_ |= Frames.Flags.hasCSS | Frames.Flags.userActed
  return innerCSS_
}

/** `true` means `port` is NOT vomnibar port */
export const isNotVomnibarPage = (port: Frames.Port, noLog: boolean): boolean => {
  let info = port.s, f = info.flags_
  if (f & Frames.Flags.isVomnibar) { return false }
  if (!noLog && !(f & Frames.Flags.SOURCE_WARNED)) {
    console.warn("Receive a request from %can unsafe source page%c (should be vomnibar) :\n %s @ tab %o",
      "color:red", "color:auto", info.url_.slice(0, 128), info.tabId_)
    info.flags_ |= Frames.Flags.SOURCE_WARNED
  }
  return true
}

/** action section */

export const safePost = <K extends keyof FullBgReq>(port: Port, req: Req.bg<K>): BOOL => {
  try {
    port.postMessage(req)
    return 1
  } catch { return 0 }
}

const show2 = (tipId: kTip | undefined, text: string): void => { showHUD(text, tipId) }

export const showHUD = (text: string | Promise<string>, tipId?: kTip): void => {
  if (typeof text !== "string") { void text.then(/*#__NOINLINE__*/ show2.bind(null, tipId)); return }
  const isCopy = tipId === kTip.noUrlCopied || tipId === kTip.noTextCopied
  if (isCopy) {
    if (text.startsWith(CONST_.BrowserProtocol_ + "-") && text.includes("://")) {
      text = text.slice(text.indexOf("/", text.indexOf("/") + 2) + 1) || text
    }
    text = text.length > 41 ? text.slice(0, 41) + "\u2026" : text && text + "."
  }
  if (cPort && !safePost(cPort, {
      N: kBgReq.showHUD, H: ensureInnerCSS(cPort.s), k: isCopy && text ? kTip.copiedIs : tipId || kTip.raw, t: text
  })) {
    set_cPort(null as never)
  }
}

export const showHUDEx = (port: Port | null | undefined, name: I18nNames
    , duration: BgReq[kBgReq.showHUD]["d"], args: (string | number | Promise<string | number> | [I18nNames])[]
    , _name2?: string): void => {
  if (!port) { return }
  let text = _name2 || transEx_(name, args)
  if (typeof text !== "string") {
    void text.then(showHUDEx.bind(null, port, "NS", duration, []))
    return
  }
  safePost(port, {
    N: kBgReq.showHUD, H: ensureInnerCSS(port.s), k: kTip.raw, d: duration, t: text
  })
}

export const ensuredExitAllGrab = (ref: Frames.Frames): void => {
  const msg: Req.bg<kBgReq.exitGrab> = { N: kBgReq.exitGrab }
  for (const p of ref.ports_) {
    if (!(p.s.flags_ & Frames.Flags.userActed)) {
      p.s.flags_ |= Frames.Flags.userActed
      p.postMessage(msg)
    }
  }
  ref.flags_ |= Frames.Flags.userActed
  return
}

export const asyncIterFrames_ = (callback: (frames: Frames.Frames) => void, doesContinue?: () => boolean | void
    ): void => {
  const MIN_ASYNC_ITER = 50
  const knownKeys = keys_(framesForTab_), knownCurTabId = curTabId_
  const iter = (tab: number): number => {
    let frames = framesForTab_.get(tab), weight = 0
    if (frames != null) {
      weight = Math.min(frames.ports_.length, 8)
      callback(frames)
    }
    return weight
  }
  if (knownKeys.length < MIN_ASYNC_ITER) {
    const ind1 = knownKeys.indexOf(knownCurTabId)
    if (ind1 >= 0) {
      knownKeys.splice(ind1, 1)
      callback(framesForTab_.get(knownCurTabId)!)
    }
    asyncIter_(knownKeys, iter, doesContinue)
  } else {
    knownKeys.forEach(iter)
  }
}

export const complainLimits = (action: string | Promise<string>): void => {
  showHUDEx(cPort, "notAllowA", 0, [action])
}

export const complainNoSession = (): void => {
  !OnChrome || Build.MinCVer >= BrowserVer.MinSessions || CurCVer_ >= BrowserVer.MinSessions
  ? complainLimits("control tab sessions")
  : showHUD(`Vimium C can not control tab sessions before Chrome ${BrowserVer.MinSessions}`)
}

if (OnChrome && Build.MinCVer < BrowserVer.MinEnsuredES6$ForOf$Map$SetAnd$Symbol
    && CurCVer_ < BrowserVer.MinEnsuredES6$ForOf$Map$SetAnd$Symbol) {
  framesForTab_.forEach = recencyForTab_.forEach = (callback: (value: any, key: number) => void): void => {
    const map = (framesForTab_ as any as SimulatedMap).map_ as Dict<any> as Dict<Frames.Frames>
    for (const key in map) {
      callback(map[key]!, +key)
    }
  }
}

export const getParentFrame = (tabId: number, curFrameId: number, level: number): Promise<Port | null> => {
  if (!curFrameId || OnChrome && Build.MinCVer < BrowserVer.MinWithFrameId && CurCVer_ < BrowserVer.MinWithFrameId
      || !browserWebNav_()) {
    return Promise.resolve(null)
  }
  if (!OnEdge && level === 1 && (!OnChrome || Build.MinCVer < BrowserVer.Min$webNavigation$$getFrame$IgnoreProcessId
      || CurCVer_ > BrowserVer.Min$webNavigation$$getFrame$IgnoreProcessId - 1)) {
    return Q_(browserWebNav_()!.getFrame, { tabId, frameId: curFrameId }).then(frame => {
      const frameId = frame ? frame.parentFrameId : 0
      return frameId > 0 ? indexFrame(tabId, frameId) : null
    })
  }
  return Q_(browserWebNav_()!.getAllFrames, { tabId }).then(frames => {
    let found = false, frameId = curFrameId
    if (!frames) { return null }
    do {
      found = false
      for (const i of frames) {
        if (i.frameId === frameId) {
          frameId = i.parentFrameId
          found = frameId > 0
          break
        }
      }
    } while (found && 0 < --level)
    return frameId > 0 && frameId !== curFrameId ? indexFrame(tabId, frameId) : null
  })
}
