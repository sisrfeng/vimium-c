import {
  OnChrome, OnFirefox, OnEdge, doc, deref_, weakRef_, chromeVer_, isJSUrl, getTime, parseSedOptions, safeCall
} from "../lib/utils"
import {
  IsInDOM_, activeEl_unsafe_, isInTouchMode_cr_, MDW, htmlTag_, CLK, attr_s, contains_s, focus_, fullscreenEl_unsafe_
} from "../lib/dom_utils"
import { suppressTail_ } from "../lib/keyboard_utils"
import { Point2D, center_, getVisibleClientRect_, view_ } from "../lib/rect"
import { insert_Lock_ } from "./insert"
import { post_ } from "./port"
import { flash_, moveSel_s_throwable } from "./dom_ui"
import { hintApi } from "./link_hints"
import { beginToPreventClick_ff, wrappedDispatchMouseEvent_ff } from "./extend_click_ff"

export declare const enum kClickAction {
  none = 0,
  /** should only be used on Firefox */ plainMayOpenManually = 1,
  forceToOpenInNewTab = 2, forceToOpenInLastWnd = 4, newTabFromMode = 8,
  openInNewWindow = 16,
  // the 1..MaxOpenForAnchor before this line should always mean HTML <a>
  MinNotPlainOpenManually = 2, MaxOpenForAnchor = 31,
  BaseMayInteract = 32, FlagDblClick = 1, FlagInteract = 2, MaxNeverInteract = BaseMayInteract + 4,
}
export declare const enum kClickButton { none = 0, primary = 1, second = 2, primaryAndTwice = 4 }
type AcceptableClickButtons = kClickButton.none | kClickButton.second | kClickButton.primaryAndTwice
type MyMouseControlKeys = [ altKey: boolean, ctrlKey: boolean, metaKey: boolean, shiftKey: boolean ]

type kMouseMoveEvents = "mouseover" | "mouseenter" | "mousemove" | "mouseout" | "mouseleave"
type kMouseClickEvents = "mousedown" | "mouseup" | "click" | "auxclick" | "dblclick"
type NullableSafeElForM = SafeElementForMouse | null | undefined

type YieldedValue = { 42: true }
type YieldedPos = { label_: number; sent_ (): YieldedValue | undefined }
type YieldableFunction = (pos: YieldedPos) => [/** step */ number, /** returned */ YieldedValue?]
declare const enum Instruction { next = 0, return = 2, /** aka. "goto" */ break = 3, yield = 4 }

let _idc: InputDeviceCapabilities | undefined
let lastHovered_: WeakRef<SafeElementForMouse> | null | undefined

export { lastHovered_ }
export function set_lastHovered_ (_newHovered: null): void { lastHovered_ = _newHovered }

/** util functions */

const __generator = Build.BTypes & BrowserType.Chrome && Build.MinCVer < BrowserVer.MinEnsuredGeneratorFunction
    ? (_0: void | undefined, branchedFunc: YieldableFunction): YieldableFunction => branchedFunc : 0 as never

const __myAwaiter = Build.BTypes & BrowserType.Chrome ? Build.MinCVer < BrowserVer.MinEnsuredGeneratorFunction
? (branchedFunc: () => YieldableFunction): Promise<any> => new Promise<any> ((resolve): void => {
  const resolveVoid = resolve.bind(0, void 0)
  const generator = branchedFunc()
  let value_: YieldedValue | undefined, async_pos_: YieldedPos = { label_: 0, sent_: () => value_ }
  resume_()
  function resume_(newValue?: YieldedValue): void {
    value_ = newValue
    let nextInst = Instruction.next
    while (~nextInst & Instruction.return) {
      let tmp = generator(async_pos_)
      nextInst = tmp[0], value_ = tmp.length > 1 ? tmp[1] : void 0
      if (Build.NDEBUG ? nextInst > Instruction.yield - 1 : nextInst === Instruction.yield) {
        async_pos_.label_++; nextInst = Instruction.yield | Instruction.return
      } else if (Build.NDEBUG ? nextInst > Instruction.break - 1 : nextInst === Instruction.break) {
        async_pos_.label_ = value_ as unknown as number
      } else if (!(Build.NDEBUG || nextInst === Instruction.next || nextInst === Instruction.return)) {
        throw Error("Assert error: unsupported async status: " + nextInst)
      }
    }
    if (nextInst < Instruction.return + 1) {
      resolve(value_)
    } else {
      Promise.resolve(value_).then(resume_).catch(Build.NDEBUG ? resolveVoid : logDebugAndResolve)
    }
  }
  function logDebugAndResolve(err: any): void {
    console.log("Vimium C: an async function fails:", err)
    resolveVoid()
  }
})
: Build.MinCVer < BrowserVer.MinEnsuredAsyncFunctions
? <TNext, TReturn> (generatorFunction: () => Generator<TNext | TReturn | Promise<TNext | TReturn>, TReturn, TNext>
    ): Promise<TReturn | void> => new Promise<TReturn | void> ((resolve): void => {
  const resolveVoid = Build.MinCVer < BrowserVer.MinTestedES6Environment ? resolve.bind(0, void 0) : () => resolve()
  const generator = generatorFunction()
  const resume_ = (lastVal?: TNext): void => {
    let yielded = generator.next(lastVal), value = yielded.value
    if (yielded.done) {
      resolve(value as TReturn | Promise<TReturn>)
    } else {
      Promise.resolve(value as TNext | Promise<TNext>).then(resume_)
          .catch(Build.NDEBUG ? resolveVoid : logDebugAndResolve)
    }
  }
  resume_()
  function logDebugAndResolve(err: any): void {
    if (!Build.NDEBUG) { console.log("Vimium C: an async function fails:", err) }
    resolveVoid()
  }
})
: 0 as never : 0 as never

const __awaiter = Build.BTypes & BrowserType.Chrome && Build.MinCVer < BrowserVer.MinEnsuredAsyncFunctions
? (_aw_self: void | 0 | undefined, _aw_args: unknown, _aw_p: PromiseConstructor | 0 | undefined
    , func_to_await: Function): Promise<YieldedValue> => __myAwaiter(func_to_await as any)
: 0 as never

export { __generator as __asyncGenerator, __awaiter as __asyncAwaiter }

export const catchAsyncErrorSilently = <T> (p: Promise<T>): Promise<T | void> =>
    OnChrome && Build.MinCVer < BrowserVer.MinEnsuredAsyncFunctions ? p
    : p.catch(Build.NDEBUG ? (): void => {} : e => { console.log("Vimium C: unexpected error\n", e) })

/** sync dispatchers */

export const mouse_ = function (element: SafeElementForMouse
    , type: kMouseClickEvents | kMouseMoveEvents
    , center: Point2D, modifiers?: MyMouseControlKeys | null, relatedTarget?: NullableSafeElForM
    , button?: AcceptableClickButtons): boolean {
  const doc = element.ownerDocument as Document, view = doc.defaultView || window,
  tyKey = type.slice(5, 6),
  // is: down | up | (click) | dblclick | auxclick
  detail = !"dui".includes(tyKey) ? 0 : button! & kClickButton.primaryAndTwice ? 2 : 1,
  x = center[0], y = center[1],
  altKey = modifiers ? modifiers[0] : !1, ctrlKey = modifiers ? modifiers[1] : !1,
  metaKey = modifiers ? modifiers[2] : !1, shiftKey = modifiers ? modifiers[3] : !1
  button = (button! & kClickButton.second) as kClickButton.none | kClickButton.second
  relatedTarget = relatedTarget && relatedTarget.ownerDocument === doc ? relatedTarget : null
  let mouseEvent: MouseEvent
  // note: there seems no way to get correct screenX/Y of an element
  if (!OnChrome
      || Build.MinCVer >= BrowserVer.MinUsable$MouseEvent$$constructor
      || chromeVer_ >= BrowserVer.MinUsable$MouseEvent$$constructor) {
    // Note: The `composed` here may require Shadow DOM support
    const init: ValidMouseEventInit = {
      bubbles: !0, cancelable: !0, composed: !0, detail, view,
      screenX: x, screenY: y, clientX: x, clientY: y, ctrlKey, shiftKey, altKey, metaKey,
      button, buttons: tyKey === "d" ? button || 1 : 0,
      relatedTarget
    },
    IDC = !OnChrome || Build.MinCVer >= BrowserVer.MinEnsured$InputDeviceCapabilities
        ? null : InputDeviceCapabilities
    if (OnChrome && (Build.MinCVer >= BrowserVer.MinEnsured$InputDeviceCapabilities || IDC)) {
      init.sourceCapabilities = _idc = _idc ||
          new (Build.MinCVer >= BrowserVer.MinEnsured$InputDeviceCapabilities ? InputDeviceCapabilities
                : IDC)!({fireTouchEvents: !1})
    }
    mouseEvent = new MouseEvent(type, init)
  } else {
    mouseEvent = doc.createEvent("MouseEvents")
    mouseEvent.initMouseEvent(type, !0, !0, view, detail, x, y, x, y
      , ctrlKey, altKey, shiftKey, metaKey, button, relatedTarget)
  }
  if (OnFirefox) {
    return wrappedDispatchMouseEvent_ff(element, mouseEvent)
  }
  return element.dispatchEvent(mouseEvent)
} as {
  (element: SafeElementForMouse, type: kMouseClickEvents
    , center: Point2D
    , modifiers?: MyMouseControlKeys | null, related?: NullableSafeElForM
    , button?: AcceptableClickButtons): boolean
  (element: SafeElementForMouse, type: kMouseMoveEvents, center: Point2D
    , modifiers?: null, related?: NullableSafeElForM): boolean
}

export const touch_cr_ = OnChrome ? (element: SafeElementForMouse
    , [x, y]: Point2D, id?: number): number => {
  const newId = id || getTime(),
  touchObj = new Touch({
    identifier: newId, target: element,
    clientX: x, clientY: y,
    screenX: x, screenY: y,
    pageX: x + scrollX, pageY: y + scrollY,
    radiusX: 8, radiusY: 8, force: 1
  }), touches = id ? [] : [touchObj],
  touchEvent = new TouchEvent(id ? "touchend" : "touchstart", {
    cancelable: true, bubbles: true,
    touches, targetTouches: touches,
    changedTouches: [touchObj]
  })
  element.dispatchEvent(touchEvent)
  return newId
} : 0 as never as null

/** async dispatchers */

/** note: will NOT skip even if newEl == @lastHovered */
export const hover_async = (async (newEl?: NullableSafeElForM, center?: Point2D): Promise<void> => {
  // if center is affected by zoom / transform, then still dispatch mousemove
  let elFromPoint = center && doc.elementFromPoint(center[0], center[1]),
  canDispatchMove: boolean = !newEl || elFromPoint === newEl || !elFromPoint || !contains_s(newEl, elFromPoint),
  last = deref_(lastHovered_), N = lastHovered_ = null
  if (last && IsInDOM_(last)) {
    const notSame = newEl !== last
    await mouse_(last, "mouseout", [0, 0], N, notSame ? newEl : N)
    if (!newEl || notSame && !IsInDOM_(newEl, last, 1)) {
      IsInDOM_(last) && mouse_(last, "mouseleave", [0, 0], N, newEl)
    }
    await 0 // should keep function effects stable - not related to what `newEl` is
  } else {
    last = N
  }
  if (newEl && IsInDOM_(newEl)) {
    // then center is not null
    await mouse_(newEl, "mouseover", center!, N, last)
    if (IsInDOM_(newEl)) {
      await mouse_(newEl, "mouseenter", center!, N, last)
      if (canDispatchMove && IsInDOM_(newEl)) {
        mouse_(newEl, "mousemove", center!)
      }
      lastHovered_ = IsInDOM_(newEl) ? weakRef_(newEl) : N
    }
  }
  // here always ensure lastHovered_ is "in DOM" or null
}) as {
  (newEl: SafeElementForMouse, center: Point2D): Promise<void>
  (newEl?: null): Promise<void>
}

export const unhover_async = (!OnChrome || Build.MinCVer >= BrowserVer.MinEnsuredGeneratorFunction
? async (element?: NullableSafeElForM): Promise<void> => {
  const old = deref_(lastHovered_), active = element || old
  if (old !== element) {
    await hover_async()
  }
  lastHovered_ = weakRef_(element)
  await hover_async()
  if (active && activeEl_unsafe_() === active) { active.blur && active.blur() }
}
: (el?: NullableSafeElForM, step?: 1 | 2, old?: NullableSafeElForM): Promise<0> | 0 => {
  if (!step) {
    old = deref_(lastHovered_)
    return Promise.resolve<void | false>(old !== el && hover_async()).then(unhover_async
        .bind<void, NullableSafeElForM, 1, NullableSafeElForM, [], Promise<0>>(0, el, 1, el || old))
  } else if (step < 2) {
    lastHovered_ = weakRef_(el)
    return hover_async().then(unhover_async.bind<0, NullableSafeElForM, 2, [], 0>(0, old, 2))
  } else {
    return <0> <any> (el && activeEl_unsafe_() === el && el.blur && el.blur())
  }
}) as {
  (element?: NullableSafeElForM, step?: undefined, active?: undefined): Promise<void | 0>
  (element: NullableSafeElForM, step: 1, active: NullableSafeElForM): Promise<0>
  (element: NullableSafeElForM, step: 2): /* all false values */ 0
  (element: NullableSafeElForM, rect: Rect | null): Promise<void | 0> // only since MinEnsuredAsyncFunctions
}


export const click_async = async (element: SafeElementForMouse
    , rect?: Rect | null, addFocus?: boolean | BOOL, modifiers?: MyMouseControlKeys | null
    , specialAction?: kClickAction, button?: AcceptableClickButtons
    , /** default: false */ touchMode?: null | false | /** false */ 0 | true | "auto"
    , /** .opener: default to true */ userOptions?: OpenUrlOptions): Promise<void | 1> => {
  /**
   * for important events including `mousedown`, `mouseup`, `click` and `dblclick`, wait for two micro tasks;
   * for other events, just wait for one micro task
   */
  if (OnEdge) {
    if ((element as Partial<HTMLInputElement /* |HTMLSelectElement|HTMLButtonElement */>).disabled) {
      return
    }
  }
  const center = center_(rect || (rect = getVisibleClientRect_(element)))
  if (OnChrome
      && (Build.MinCVer >= BrowserVer.MinEnsuredTouchEventConstructor
          || chromeVer_ >= BrowserVer.MinEnsuredTouchEventConstructor)
      && (touchMode === !0 || touchMode && isInTouchMode_cr_!())) {
    let id = await touch_cr_!(element, center)
    if (IsInDOM_(element)) {
      await touch_cr_!(element, center, id)
    }
    if (!IsInDOM_(element)) { return }
  }
  if (element !== deref_(lastHovered_)) {
    await hover_async(element, center)
    if (!lastHovered_) { return }
  }
  if (OnFirefox) {
    // https://bugzilla.mozilla.org/show_bug.cgi?id=329509 says this starts on FF65,
    // but tests also confirmed it on Firefox 63.0.3 x64, Win10
    if ((element as Partial<HTMLInputElement /* |HTMLSelectElement|HTMLButtonElement */>).disabled) {
      return
    }
  }
  const mousedownNotPrevented = await mouse_(element, MDW, center, modifiers, null, button)
  await 0
  if (!IsInDOM_(element)) { return }
  // Note: here we can check doc.activeEl only when @click is used on the current focused document
  if (addFocus && mousedownNotPrevented && element !== insert_Lock_() && element !== activeEl_unsafe_() &&
      !(element as Partial<HTMLInputElement>).disabled) {
    focus_(element)
    if (!IsInDOM_(element)) { return }
    await 0
  }
  await mouse_(element, "mouseup", center, modifiers, null, button)
  await 0
  if (!IsInDOM_(element)) { return }
  if (button === kClickButton.second) {
    // if button is the right, then auxclick can be triggered even if element.disabled
    mouse_(element, "auxclick", center, modifiers, null, button)
  }
  if (button === kClickButton.second) { return }
  if (OnChrome && (element as Partial<HTMLInputElement /* |HTMLSelectElement|HTMLButtonElement */>).disabled) {
    return
  }
  const enum ActionType {
    OnlyDispatch = 0,
    dblClick = kClickAction.FlagDblClick, interact = kClickAction.FlagInteract,
    MinOpenUrl = kClickAction.MaxNeverInteract - kClickAction.MaxOpenForAnchor,
    DispatchAndMayOpenTab = MinOpenUrl, OpenTabButNotDispatch,
  }
  let result: ActionType = ActionType.OnlyDispatch, url: string | null
  let parentAnchor: Partial<Pick<HTMLAnchorElement, "target" | "href" | "rel">> & Element | null | undefined
  if (specialAction) {
    // for forceToDblclick, element can be OtherSafeElement; for 1..MaxOpenForAnchor, element must be in <html:a>
    result = specialAction > kClickAction.BaseMayInteract ? specialAction - kClickAction.BaseMayInteract
        : !(parentAnchor = OnChrome && Build.MinCVer < BrowserVer.MinEnsured$Element$$Closest && !element.closest
              ? element
              : (parentAnchor = element.closest!("a")) && htmlTag_(parentAnchor) ? parentAnchor : null)
          || (OnFirefox ? specialAction < kClickAction.MinNotPlainOpenManually && parentAnchor.target !== "_blank" : 0)
          || !(url = attr_s(parentAnchor as SafeElement, "href"))
          || specialAction & (kClickAction.forceToOpenInNewTab | kClickAction.forceToOpenInLastWnd)
              && url[0] === "#"
          || isJSUrl(url)
        ? ActionType.OnlyDispatch
        : OnFirefox && specialAction & (kClickAction.plainMayOpenManually | kClickAction.openInNewWindow)
        ? ActionType.DispatchAndMayOpenTab : ActionType.OpenTabButNotDispatch
  }
  if ((result > ActionType.OpenTabButNotDispatch - 1
        || (OnFirefox && /*#__INLINE__*/ beginToPreventClick_ff(result === ActionType.DispatchAndMayOpenTab),
            await await mouse_(element, CLK, center, modifiers) && result))
      && getVisibleClientRect_(element)) {
    // require element is still visible
    if (result! < ActionType.MinOpenUrl) {
      if (result & ActionType.dblClick
          && !(element as Partial<HTMLInputElement /* |HTMLSelectElement|HTMLButtonElement */>).disabled) {
        // use old rect
        await click_async(element, rect, 0, modifiers, kClickAction.none, kClickButton.primaryAndTwice)
        if (!getVisibleClientRect_(element)
            || !await await mouse_(element, "dblclick", center, modifiers, null, kClickButton.primaryAndTwice)
            || !getVisibleClientRect_(element)) {
          return
        }
      }
      if (result & ActionType.interact) {
        if (result & ActionType.dblClick) {
          if (htmlTag_(element) === "video") {
            if ((!OnChrome ? !OnFirefox || element.requestFullscreen
                  : Build.MinCVer >= BrowserVer.MinEnsured$Document$$fullscreenElement
                    || chromeVer_ > BrowserVer.MinEnsured$Document$$fullscreenElement - 1)) {
              fullscreenEl_unsafe_() ? doc.exitFullscreen() : element.requestFullscreen!()
            } else {
              fullscreenEl_unsafe_()
              ? OnFirefox ? doc.mozCancelFullScreen() : doc.webkitExitFullscreen()
              : OnFirefox ? element.mozRequestFullScreen() : element.webkitRequestFullscreen()
            }
          }
        } else {
          (element as HTMLMediaElement).paused ? (element as HTMLMediaElement).play()
          : (element as HTMLMediaElement).pause()
        }
      }
      return
    }
    // use latest attributes
    const relAttr = parentAnchor!.rel, openerOpt = userOptions && userOptions.opener,
    /** {@link #BrowserVer.Min$TargetIsBlank$Implies$Noopener} and FirefoxBrowserVer's */
    noopener = openerOpt != null ? !openerOpt : !relAttr ? parentAnchor!.target === "_blank"
        : (!OnChrome || Build.MinCVer >= BrowserVer.MinEnsuredES6$Array$$Includes
            ? relAttr.split(<RegExpOne> /\s/).includes!("noopener")
            : relAttr.split(<RegExpOne> /\s/).indexOf("noopener") >= 0),
    reuse = OnFirefox && specialAction! & kClickAction.openInNewWindow
        ? ReuseType.newWindow
        : specialAction! & kClickAction.forceToOpenInLastWnd
          ? specialAction! < kClickAction.newTabFromMode ? ReuseType.lastWndFg : ReuseType.lastWndBg
        : modifiers && modifiers[3] || specialAction! < kClickAction.newTabFromMode
          ? ReuseType.newFg : ReuseType.newBg;
    (hintApi ? hintApi.p : post_)({
      H: kFgReq.openUrl,
      u: parentAnchor!.href,
      f: !0,
      e: userOptions && parseSedOptions(userOptions),
      n: noopener,
      p: userOptions && userOptions.position,
      r: reuse
    })
    return 1
  }
}

export const select_ = (element: LockableElement, rect?: Rect | null, show_flash?: boolean
    , action?: SelectActions, suppressRepeated?: boolean): Promise<void> => {
  const y = scrollY
  return catchAsyncErrorSilently(click_async(element, rect, 1)).then((): void => {
    view_(element, y)
    // re-compute rect of element, in case that an input is resized when focused
    show_flash && flash_(element)
    if (element !== insert_Lock_()) { return }
    // then `element` is always safe
    if (Build.NDEBUG) {
      safeCall(/*#__INLINE__*/ moveSel_s_throwable, element, action)
    } else {
      try {
        moveSel_s_throwable(element, action)
      } catch (e) {
        console.log("Vimium C: failed in moving caret.", e)
      }
    }
    if (suppressRepeated) { suppressTail_() }
  })
}

if (Build.BTypes & BrowserType.Chrome && Build.MinCVer < BrowserVer.MinEnsuredGeneratorFunction) {
  if (!(Build.NDEBUG || (<RegExpOne> /\.label_\b/).test(click_async + ""))) {
    alert("Assert error: async functions should have used `label_` and `sent_`")
  }
}
