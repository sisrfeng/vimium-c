import { safer, loc_, vApi, locHref, isTY, isTop, OnFirefox, injector } from "../lib/utils"
import { createElement_, dispatchEvent_, wrapEventInit_, scrollingEl_, textContent_s } from "../lib/dom_utils"
import { post_ } from "./port"
import { hudHide, hudShow } from "./hud"
import { removeHandler_, getMappedKey, isEscape_, replaceOrSuppressMost_, hasShift_ff } from "../lib/keyboard_utils"
import { makeElementScrollBy_ } from "./scroller"

// [0, 2..9]
let previous: Readonly<MarksNS.FgMark>[] = []

const dispatchMark = ((mark?: Readonly<MarksNS.FgMark> | null | undefined, local?: 0 | 2
    ): Readonly<MarksNS.FgMark> | MarksNS.FgMark | null => {
  let a = createElement_("a"), oldStr: string | undefined, newStr: string, match: string[],
  newMark: Readonly<MarksNS.FgMark> | null | undefined
  mark && textContent_s(a, oldStr = mark + "")
  local && (a.dataset.local = "")
  newMark = !dispatchEvent_(window, new FocusEvent("vimiumMark"
        , wrapEventInit_<FocusEventInit>({ relatedTarget: a }))) ? null
      : (newStr = textContent_s(a)) === oldStr ? mark
      : (match = newStr.split(",")).length > 1 ? ([~~match[0], ~~match[1]] as const
          ).concat(match.slice(2) as never) as [number, number, string]
      : mark
  return mark ? newMark as Readonly<MarksNS.FgMark> | MarksNS.FgMark | null : newMark || [scrollX | 0, scrollY | 0]
}) as {
  (mark: Readonly<MarksNS.FgMark>): Readonly<MarksNS.FgMark> | null | MarksNS.FgMark
  (mark?: undefined | null, local?: 0 | 2): MarksNS.FgMark // to create
}

export const setPreviousMarkPosition = (idx?: number): void => {
  const arr = dispatchMark()
  arr.length === 2 && arr.push(loc_.hash)
  previous[idx! | 0] = arr
}

export const activate = (options: CmdOptions[kFgCmd.marks], mcount: number): void => {
  const isCreate = options.mode === "create"
  const swap = !!options.swap
  mcount = mcount < 2 || mcount > 9 ? 0 : mcount
  hudShow(<number> <number | boolean> isCreate + kTip.nowGotoMark)
  replaceOrSuppressMost_(kHandler.marks, (event): HandlerResult => {
  if (event.i === kKeyCode.ime) { return HandlerResult.Nothing }
  const keyChar = getMappedKey(event, kModeId.Marks)
  let tempPos: MarksNS.FgMark | undefined
  if (keyChar.length !== 1 && !isEscape_(keyChar)) {
    return HandlerResult.Suppress
  }
  removeHandler_(kHandler.marks)
  if (isEscape_(keyChar)) {
    hudHide()
  } else if ("`'".includes(keyChar)) {
    if (isCreate) {
      setPreviousMarkPosition(mcount)
    } else {
      tempPos = previous[mcount]
      setPreviousMarkPosition(tempPos ? 0 : mcount)
      tempPos && scrollToMark(tempPos)
    }
    post_({ H: kFgReq.didLocalMarkTask, m: tempPos, i: mcount })
  } else if (isCreate) {
    if ((OnFirefox ? hasShift_ff!(event.e) : event.e.shiftKey) !== swap) {
      if (isTop || injector) {
        createMark({n: keyChar})
      } else {
        post_({H: kFgReq.marks, a: kMarkAction.create, n: keyChar})
        hudHide()
      }
    } else {
      createMark({n: keyChar}, 2)
    }
  } else {
    const req: Extract<Req.fg<kFgReq.marks>, { a: kMarkAction.goto } & MarksNS.FgQuery> = {
      H: kFgReq.marks, a: kMarkAction.goto, n: keyChar, c: options
    }
    if ((OnFirefox ? hasShift_ff!(event.e) : event.e.shiftKey) !== swap) {
      hudHide()
    } else {
      try {
        let pos: {scrollX: number, scrollY: number, hash?: string} | null = null
        const key = `vimiumMark|${locHref().split("#", 1)[0]}|${keyChar}`
        let storage = localStorage, markString = storage && storage.getItem(key)
        if (markString && (pos = JSON.parse(markString)) && isTY(pos, kTY.obj)) {
          safer(pos)
          const scrollX = pos.scrollX, scrollY = pos.scrollY, hash = pos.hash
          if (scrollX >= 0 && scrollY >= 0) {
            (req as MarksNS.FgQuery as MarksNS.FgLocalQuery).o = {
              x: scrollX | 0, y: scrollY | 0, h: "" + (hash || "")
            }
          }
        }
      } catch {}
      (req as MarksNS.FgQuery as MarksNS.FgLocalQuery).l = 2;
      (req as MarksNS.FgQuery as MarksNS.FgLocalQuery).u = locHref()
    }
    post_(req);
  }
  return HandlerResult.Prevent
  })
}

export const scrollToMark = ((scroll: Readonly<MarksNS.FgMark> | null | undefined): void => {
  scroll = dispatchMark(scroll!)
  if (scroll) {
    if (scroll[1] === 0 && scroll[2] && scroll[0] === 0) {
      loc_.hash = scroll[2];
    } else {
      makeElementScrollBy_(scrollingEl_(1), scroll[0] - scrollX, scroll[1] - scrollY)
    }
  }
}) as (scroll: Readonly<MarksNS.FgMark>) => void

export const createMark = (req: BgReq[kBgReq.createMark], local?: 0 | 2): void => {
    post_<kFgReq.marks>({
      H: kFgReq.marks,
      a: kMarkAction.create,
      l: local,
      n: req.n,
      u: locHref(),
      s: dispatchMark(null, local)
    })
}

export const gotoMark = ({ n: a, s: scroll, l: local }: BgReq[kBgReq.goToMark]): void => {
    a && setPreviousMarkPosition()
    scrollToMark(scroll)
    local || vApi.f()
}

if (!(Build.NDEBUG || kTip.nowGotoMark + 1 === kTip.nowCreateMark)) {
  console.log("Assert error: kTip.nowGotoMark + 1 === kTip.nowCreateMark")
}
