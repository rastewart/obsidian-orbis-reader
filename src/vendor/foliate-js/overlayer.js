// ORBIS patch 33 — see #zoom.
import { Platform } from 'obsidian'

const createSVGElement = tag =>
    document.createElementNS('http://www.w3.org/2000/svg', tag)

// ORBIS patch 15 — a range is measured one text node at a time, so a selection across a heading or a list item is
// drawn there too; upstream measured only <p> elements. See ORBIS-CHANGES.md.
const RECT_ELEMENTS = new Set(['img', 'svg', 'video', 'canvas'])
export const splitRangeForRects = range => {
    const root = range.commonAncestorContainer
    if (root.nodeType === Node.TEXT_NODE) return [range]
    const doc = root.ownerDocument ?? root
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
    walker.currentNode = range.startContainer
    const out = []
    for (let node = walker.currentNode; node; node = walker.nextNode()) {
        // Past the end of the range: nothing later can intersect it.
        if (node !== root && range.comparePoint(node, 0) > 0) break
        if (!range.intersectsNode(node)) continue
        if (node.nodeType === Node.TEXT_NODE) {
            const piece = doc.createRange()
            piece.selectNodeContents(node)
            if (node === range.startContainer) piece.setStart(node, range.startOffset)
            if (node === range.endContainer) piece.setEnd(node, range.endOffset)
            if (!piece.collapsed) out.push(piece)
        } else if (RECT_ELEMENTS.has(node.localName)) {
            // An image has no text to measure: its own box is what the selection covers, when all of it is selected.
            const piece = doc.createRange()
            piece.selectNode(node)
            if (range.compareBoundaryPoints(Range.START_TO_START, piece) <= 0
                && range.compareBoundaryPoints(Range.END_TO_END, piece) >= 0) out.push(piece)
        }
    }
    return out.length ? out : [range]
}

export class Overlayer {
    #svg = createSVGElement('svg')
    #map = new Map()
    #doc = null
    constructor(doc) {
        this.#doc = doc
        Object.assign(this.#svg.style, {
            position: 'absolute', top: '0', left: '0',
            width: '100%', height: '100%',
            pointerEvents: 'none',
        })
    }
    get element() {
        return this.#svg
    }
    get #zoom() {
        // Safari does not zoom the client rects, while Chrome, Edge and Firefox does
        // ORBIS patch 33 — Obsidian's Platform names the one place it runs on WebKit, the iPhone and iPad app, which
        // upstream picked out from the user agent: every other Obsidian is Chromium. See ORBIS-CHANGES.md.
        if (Platform.isIosApp) {
            return window.getComputedStyle(this.#doc.body).zoom || 1.0
        }
        return 1.0
    }
    add(key, range, draw, options) {
        if (this.#map.has(key)) this.remove(key)
        if (typeof range === 'function') range = range(this.#svg.getRootNode())
        const zoom = this.#zoom
        let rects = []
        splitRangeForRects(range).forEach((pRange) => {
            const pRects = Array.from(pRange.getClientRects()).map(rect => ({
                left: rect.left * zoom,
                top: rect.top * zoom,
                right: rect.right * zoom,
                bottom: rect.bottom * zoom,
                width: rect.width * zoom,
                height: rect.height * zoom,
            }))
            rects = rects.concat(pRects)
        })
        const element = draw(rects, options)
        this.#svg.append(element)
        this.#map.set(key, { range, draw, options, element, rects })
    }
    remove(key) {
        if (!this.#map.has(key)) return
        this.#svg.removeChild(this.#map.get(key).element)
        this.#map.delete(key)
    }
    redraw() {
        for (const obj of this.#map.values()) {
            const { range, draw, options, element } = obj
            this.#svg.removeChild(element)
            const zoom = this.#zoom
            let rects = []
            splitRangeForRects(range).forEach((pRange) => {
                const pRects = Array.from(pRange.getClientRects()).map(rect => ({
                    left: rect.left * zoom,
                    top: rect.top * zoom,
                    right: rect.right * zoom,
                    bottom: rect.bottom * zoom,
                    width: rect.width * zoom,
                    height: rect.height * zoom,
                }))
                rects = rects.concat(pRects)
            })
            const el = draw(rects, options)
            this.#svg.append(el)
            obj.element = el
            obj.rects = rects
        }
    }
    hitTest({ x, y }) {
        const arr = Array.from(this.#map.entries())
        // loop in reverse to hit more recently added items first
        for (let i = arr.length - 1; i >= 0; i--) {
            const [key, obj] = arr[i]
            for (const { left, top, right, bottom } of obj.rects)
                if (top <= y && left <= x && bottom > y && right > x)
                    return [key, obj.range]
        }
        return []
    }
    static underline(rects, options = {}) {
        const { color = 'red', width: strokeWidth = 2, padding = 0, writingMode } = options
        const g = createSVGElement('g')
        g.setAttribute('fill', color)
        if (writingMode === 'vertical-rl' || writingMode === 'vertical-lr')
            for (const { right, top, height } of rects) {
                const el = createSVGElement('rect')
                el.setAttribute('x', right - strokeWidth / 2 + padding)
                el.setAttribute('y', top)
                el.setAttribute('height', height)
                el.setAttribute('width', strokeWidth)
                g.append(el)
            }
        else for (const { left, bottom, width } of rects) {
            const el = createSVGElement('rect')
            el.setAttribute('x', left)
            el.setAttribute('y', bottom - strokeWidth / 2 + padding)
            el.setAttribute('height', strokeWidth)
            el.setAttribute('width', width)
            g.append(el)
        }
        return g
    }
    static strikethrough(rects, options = {}) {
        const { color = 'red', width: strokeWidth = 2, writingMode } = options
        const g = createSVGElement('g')
        g.setAttribute('fill', color)
        if (writingMode === 'vertical-rl' || writingMode === 'vertical-lr')
            for (const { right, left, top, height } of rects) {
                const el = createSVGElement('rect')
                el.setAttribute('x', (right + left) / 2)
                el.setAttribute('y', top)
                el.setAttribute('height', height)
                el.setAttribute('width', strokeWidth)
                g.append(el)
            }
        else for (const { left, top, bottom, width } of rects) {
            const el = createSVGElement('rect')
            el.setAttribute('x', left)
            el.setAttribute('y', (top + bottom) / 2)
            el.setAttribute('height', strokeWidth)
            el.setAttribute('width', width)
            g.append(el)
        }
        return g
    }
    static squiggly(rects, options = {}) {
        const { color = 'red', width: strokeWidth = 2, padding = 0, writingMode } = options
        const g = createSVGElement('g')
        g.setAttribute('fill', 'none')
        g.setAttribute('stroke', color)
        g.setAttribute('stroke-width', strokeWidth)
        const block = strokeWidth * 1.5
        if (writingMode === 'vertical-rl' || writingMode === 'vertical-lr')
            for (const { right, top, height } of rects) {
                const el = createSVGElement('path')
                const n = Math.round(height / block / 1.5)
                const inline = height / n
                const ls = Array.from({ length: n },
                    (_, i) => `l${i % 2 ? -block : block} ${inline}`).join('')
                el.setAttribute('d', `M${right - strokeWidth / 2 + padding} ${top}${ls}`)
                g.append(el)
            }
        else for (const { left, bottom, width } of rects) {
            const el = createSVGElement('path')
            const n = Math.round(width / block / 1.5)
            const inline = width / n
            const ls = Array.from({ length: n },
                (_, i) => `l${inline} ${i % 2 ? block : -block}`).join('')
            el.setAttribute('d', `M${left} ${bottom + strokeWidth / 2 + padding}${ls}`)
            g.append(el)
        }
        return g
    }
    static highlight(rects, options = {}) {
        const { color = 'red', padding = 0 } = options
        const g = createSVGElement('g')
        g.setAttribute('fill', color)
        // ORBIS patch 34 — the opacity and blend mode upstream set inline are the class's, in the paginator's
        // stylesheet, the only place an overlay is drawn. See ORBIS-CHANGES.md.
        g.setAttribute('class', 'foliate-highlight')
        for (const { left, top, height, width } of rects) {
            const el = createSVGElement('rect')
            el.setAttribute('x', left - padding)
            el.setAttribute('y', top - padding)
            el.setAttribute('height', height + padding * 2)
            el.setAttribute('width', width + padding * 2)
            g.append(el)
        }
        return g
    }
    static outline(rects, options = {}) {
        const { color = 'red', width: strokeWidth = 3, padding = 0, radius = 3 } = options
        const g = createSVGElement('g')
        g.setAttribute('fill', 'none')
        g.setAttribute('stroke', color)
        g.setAttribute('stroke-width', strokeWidth)
        for (const { left, top, height, width } of rects) {
            const el = createSVGElement('rect')
            el.setAttribute('x', left - padding)
            el.setAttribute('y', top - padding)
            el.setAttribute('height', height + padding * 2)
            el.setAttribute('width', width + padding * 2)
            el.setAttribute('rx', radius)
            g.append(el)
        }
        return g
    }
    // make an exact copy of an image in the overlay
    // one can then apply filters to the entire element, without affecting them;
    // it's a bit silly and probably better to just invert images twice
    // (though the color will be off in that case if you do heu-rotate)
    static copyImage([rect], options = {}) {
        const { src } = options
        const image = createSVGElement('image')
        const { left, top, height, width } = rect
        image.setAttribute('href', src)
        image.setAttribute('x', left)
        image.setAttribute('y', top)
        image.setAttribute('height', height)
        image.setAttribute('width', width)
        return image
    }
}

