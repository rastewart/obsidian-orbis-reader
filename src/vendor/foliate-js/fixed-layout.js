import 'construct-style-sheets-polyfill'

const parseViewport = str => str
    ?.split(/[,;\s]/) // NOTE: technically, only the comma is valid
    ?.filter(x => x)
    ?.map(x => x.split('=').map(x => x.trim()))

const getViewport = (doc, viewport) => {
    // use `viewBox` for SVG
    if (doc.documentElement.localName === 'svg') {
        const [, , width, height] = doc.documentElement
            .getAttribute('viewBox')?.split(/\s/) ?? []
        return { width, height }
    }

    // get `viewport` `meta` element
    const meta = parseViewport(doc.querySelector('meta[name="viewport"]')
        ?.getAttribute('content'))
    if (meta) return Object.fromEntries(meta)

    // fallback to book's viewport
    if (typeof viewport === 'string') return parseViewport(viewport)
    if (viewport?.width && viewport.height) return viewport

    // if no viewport (possibly with image directly in spine), get image size
    const img = doc.querySelector('img')
    if (img) return { width: img.naturalWidth, height: img.naturalHeight }

    // just show *something*, i guess...
    console.warn(new Error('Missing viewport properties'))
    return { width: 1000, height: 2000 }
}

export class FixedLayout extends HTMLElement {
    // ORBIS patch 38 — `max-column-count`, as the paginator reads it: 1 shows one page at a time. See ORBIS-CHANGES.md.
    static observedAttributes = ['zoom', 'max-column-count']
    #onePage = false
    #root = this.attachShadow({ mode: 'closed' })
    #observer = new ResizeObserver(() => this.#render())
    #spreads
    #index = -1
    defaultViewport
    spread
    #portrait = false
    #left
    #right
    #center
    #side
    #zoom
    constructor() {
        super()

        const sheet = new CSSStyleSheet()
        this.#root.adoptedStyleSheets = [sheet]
        sheet.replaceSync(`:host {
            width: 100%;
            height: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
            overflow: auto;
        }`)

        this.#observer.observe(this)

        // ORBIS patch 37 — a swipe turns the page. Each page is its own document, so a touch on a page reaches only
        // that page's listeners: the frames get them as they load, and this element gets them for the margins
        // around the pages. See ORBIS-CHANGES.md.
        const opts = { passive: false }
        const listen = target => {
            target.addEventListener('touchstart', e => this.#onTouchStart(e), opts)
            target.addEventListener('touchmove', e => this.#onTouchMove(e), opts)
            target.addEventListener('touchend', e => this.#onTouchEnd(e))
            target.addEventListener('touchcancel', () => this.#touch = null)
        }
        listen(this)
        this.addEventListener('load', ({ detail: { doc } }) => listen(doc))
    }
    // ORBIS patch 37 — where a one-finger touch began, and when; null once a second finger lands.
    #touch = null
    #selecting() {
        return this.getContents().some(({ doc }) => doc?.getSelection()?.type === 'Range')
    }
    // ORBIS patch 37 — how far the page is scrolled sideways, and how far it can be: only a zoomed page scrolls.
    #scrollRange() {
        return { at: this.scrollLeft, max: this.scrollWidth - this.clientWidth }
    }
    #onTouchStart(e) {
        const touch = e.changedTouches[0]
        this.#touch = e.touches.length > 1 || !touch ? null
            : { x: touch.screenX, y: touch.screenY, t: e.timeStamp, at: this.#scrollRange().at }
    }
    #onTouchMove(e) {
        if (e.touches.length > 1) this.#touch = null
        if (!this.#touch || this.#selecting() || globalThis.visualViewport?.scale > 1) return
        // As the paginator does: the drag is the page's to turn, not the browser's to scroll or bounce. A zoomed
        // page still pans.
        if (this.#scrollRange().max <= 1) e.preventDefault()
    }
    #onTouchEnd(e) {
        const start = this.#touch
        this.#touch = null
        const touch = e.changedTouches[0]
        if (!start || !touch || this.#selecting() || globalThis.visualViewport?.scale > 1) return
        const dx = touch.screenX - start.x
        const dy = touch.screenY - start.y
        if (Math.abs(dx) <= Math.abs(dy)) return
        // Far enough, or a quick flick: the paginator turns on a flick of a few pixels too.
        const speed = Math.abs(dx) / Math.max(1, e.timeStamp - start.t)
        if (Math.abs(dx) < 40 && (Math.abs(dx) < 10 || speed < 0.3)) return
        // A zoomed page turns only from the edge it was already at when the swipe began; before that, a swipe pans.
        const { max } = this.#scrollRange()
        if (max > 1 && (dx < 0 ? start.at < max - 1 : start.at > 1)) return
        // The swipe that turned the page is not also a tap: a flick of a few pixels can still end in a click, which
        // would open the picture in Orbis's image viewer, or turn the page again at its edge.
        this.#swallowClick(e.currentTarget)
        // The finger moving left brings in what is to the right: the next page left to right, the previous one in
        // a right-to-left book.
        if (dx < 0) this.rtl ? this.prev() : this.next()
        else this.rtl ? this.next() : this.prev()
    }
    #swallowClick(target) {
        const swallow = e => {
            e.preventDefault()
            e.stopImmediatePropagation()
        }
        target.addEventListener('click', swallow, { capture: true, once: true })
        setTimeout(() => target.removeEventListener('click', swallow, { capture: true }), 500)
    }
    attributeChangedCallback(name, _, value) {
        switch (name) {
            case 'zoom':
                this.#zoom = value !== 'fit-width' && value !== 'fit-page'
                    ? parseFloat(value) : value
                this.#render()
                break
            case 'max-column-count':
                this.#onePage = parseInt(value) === 1
                this.#render()
                break
        }
    }
    async #createFrame({ index, src: srcOption }) {
        const srcOptionIsString = typeof srcOption === 'string'
        const src = srcOptionIsString ? srcOption : srcOption?.src
        const onZoom = srcOptionIsString ? null : srcOption?.onZoom
        const element = document.createElement('div')
        element.setAttribute('dir', 'ltr')
        const iframe = document.createElement('iframe')
        element.append(iframe)
        Object.assign(iframe.style, {
            border: '0',
            display: 'none',
            overflow: 'hidden',
        })
        // ORBIS patch 17 — `part` before `sandbox`, as paginator.js has it: the desktop sandbox patch knows a book
        // frame by its `part`. See ORBIS-CHANGES.md.
        iframe.setAttribute('part', 'filter')
        // `allow-scripts` is needed for events because of WebKit bug
        // https://bugs.webkit.org/show_bug.cgi?id=218086
        iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts')
        iframe.setAttribute('scrolling', 'no')
        this.#root.append(element)
        if (!src) return { blank: true, element, iframe }
        return new Promise(resolve => {
            iframe.addEventListener('load', () => {
                const doc = iframe.contentDocument
                this.dispatchEvent(new CustomEvent('load', { detail: { doc, index } }))
                const { width, height } = getViewport(doc, this.defaultViewport)
                resolve({
                    element, iframe,
                    width: parseFloat(width),
                    height: parseFloat(height),
                    onZoom,
                })
            }, { once: true })
            iframe.src = src
        })
    }
    #render(side = this.#side) {
        if (!side) return
        const left = this.#left ?? {}
        const right = this.#center ?? this.#right ?? {}
        const target = side === 'left' ? left : right
        const { width, height } = this.getBoundingClientRect()
        // ORBIS patch 38 — one page at a time when the reader asks for one column, whatever the pane's shape and
        // whatever the book says about spreads. Upstream showed a spread whenever the pane was wider than tall.
        const portrait = this.#onePage
            || this.spread !== 'both' && this.spread !== 'portrait' && height > width
        this.#portrait = portrait
        const blankWidth = left.width ?? right.width ?? 0
        const blankHeight = left.height ?? right.height ?? 0

        const scale = typeof this.#zoom === 'number' && !isNaN(this.#zoom)
            ? this.#zoom
            : (this.#zoom === 'fit-width'
                ? (portrait || this.#center
                    ? width / (target.width ?? blankWidth)
                    : width / ((left.width ?? blankWidth) + (right.width ?? blankWidth)))
                : (portrait || this.#center
                    ? Math.min(
                        width / (target.width ?? blankWidth),
                        height / (target.height ?? blankHeight))
                    : Math.min(
                        width / ((left.width ?? blankWidth) + (right.width ?? blankWidth)),
                        height / Math.max(
                            left.height ?? blankHeight,
                            right.height ?? blankHeight)))
            ) || 1

        const transform = frame => {
            let { element, iframe, width, height, blank, onZoom } = frame
            if (!iframe) return
            if (onZoom) onZoom({ doc: frame.iframe.contentDocument, scale })
            const iframeScale = onZoom ? scale : 1
            Object.assign(iframe.style, {
                width: `${width * iframeScale}px`,
                height: `${height * iframeScale}px`,
                transform: onZoom ? 'none' : `scale(${scale})`,
                transformOrigin: 'top left',
                display: blank ? 'none' : 'block',
            })
            // ORBIS patch 34 — the page of a spread that portrait does not show is hidden in the same assignment that
            // shows the others, as the frame's display is above, not set to `block` and then to `none`.
            Object.assign(element.style, {
                width: `${(width ?? blankWidth) * scale}px`,
                height: `${(height ?? blankHeight) * scale}px`,
                overflow: 'hidden',
                display: portrait && frame !== target ? 'none' : 'block',
                flexShrink: '0',
                marginBlock: 'auto',
            })
        }
        if (this.#center) {
            transform(this.#center)
        } else {
            transform(left)
            transform(right)
        }
    }
    async #showSpread({ left, right, center, side }) {
        this.#root.replaceChildren()
        this.#left = null
        this.#right = null
        this.#center = null
        if (center) {
            this.#center = await this.#createFrame(center)
            this.#side = 'center'
            this.#render()
        } else {
            this.#left = await this.#createFrame(left)
            this.#right = await this.#createFrame(right)
            this.#side = this.#left.blank ? 'right'
                : this.#right.blank ? 'left' : side
            this.#render()
        }
    }
    #goLeft() {
        if (this.#center || this.#left?.blank) return
        if (this.#portrait && this.#left?.element?.style?.display === 'none') {
            this.#side = 'left'
            this.#render()
            this.#reportLocation('page')
            return true
        }
    }
    #goRight() {
        if (this.#center || this.#right?.blank) return
        if (this.#portrait && this.#right?.element?.style?.display === 'none') {
            this.#side = 'right'
            this.#render()
            this.#reportLocation('page')
            return true
        }
    }
    open(book) {
        this.book = book
        const { rendition } = book
        this.spread = rendition?.spread
        this.defaultViewport = rendition?.viewport

        const rtl = book.dir === 'rtl'
        const ltr = !rtl
        this.rtl = rtl

        if (rendition?.spread === 'none')
            this.#spreads = book.sections.map(section => ({ center: section }))
        else this.#spreads = book.sections.reduce((arr, section, i) => {
            const last = arr[arr.length - 1]
            const { pageSpread } = section
            const newSpread = () => {
                const spread = {}
                arr.push(spread)
                return spread
            }
            if (pageSpread === 'center') {
                const spread = last.left || last.right ? newSpread() : last
                spread.center = section
            }
            else if (pageSpread === 'left') {
                const spread = last.center || last.left || ltr && i ? newSpread() : last
                spread.left = section
            }
            else if (pageSpread === 'right') {
                const spread = last.center || last.right || rtl && i ? newSpread() : last
                spread.right = section
            }
            else if (ltr) {
                if (last.center || last.right) newSpread().left = section
                else if (last.left || !i) last.right = section
                else last.left = section
            }
            else {
                if (last.center || last.left) newSpread().right = section
                else if (last.right || !i) last.left = section
                else last.right = section
            }
            return arr
        }, [{}])
    }
    get index() {
        const spread = this.#spreads[this.#index]
        const section = spread?.center ?? (this.#side === 'left'
            ? spread.left ?? spread.right : spread.right ?? spread.left)
        return this.book.sections.indexOf(section)
    }
    #reportLocation(reason) {
        this.dispatchEvent(new CustomEvent('relocate', { detail:
            { reason, range: null, index: this.index, fraction: 0, size: 1 } }))
    }
    getSpreadOf(section) {
        const spreads = this.#spreads
        for (let index = 0; index < spreads.length; index++) {
            const { left, right, center } = spreads[index]
            if (left === section) return { index, side: 'left' }
            if (right === section) return { index, side: 'right' }
            if (center === section) return { index, side: 'center' }
        }
    }
    async goToSpread(index, side, reason) {
        if (index < 0 || index > this.#spreads.length - 1) return
        if (index === this.#index) {
            this.#render(side)
            return
        }
        this.#index = index
        const spread = this.#spreads[index]
        if (spread.center) {
            const index = this.book.sections.indexOf(spread.center)
            const src = await spread.center?.load?.()
            await this.#showSpread({ center: { index, src } })
        } else {
            const indexL = this.book.sections.indexOf(spread.left)
            const indexR = this.book.sections.indexOf(spread.right)
            const srcL = await spread.left?.load?.()
            const srcR = await spread.right?.load?.()
            const left = { index: indexL, src: srcL }
            const right = { index: indexR, src: srcR }
            await this.#showSpread({ left, right, side })
        }
        this.#reportLocation(reason)
    }
    async select(target) {
        await this.goTo(target)
        // TODO
    }
    async goTo(target) {
        const { book } = this
        const resolved = await target
        const section = book.sections[resolved.index]
        if (!section) return
        const { index, side } = this.getSpreadOf(section)
        await this.goToSpread(index, side)
    }
    async next() {
        const s = this.rtl ? this.#goLeft() : this.#goRight()
        if (!s) return this.goToSpread(this.#index + 1, this.rtl ? 'right' : 'left', 'page')
    }
    async prev() {
        const s = this.rtl ? this.#goRight() : this.#goLeft()
        if (!s) return this.goToSpread(this.#index - 1, this.rtl ? 'left' : 'right', 'page')
    }
    getContents() {
        return Array.from(this.#root.querySelectorAll('iframe'), frame => ({
            doc: frame.contentDocument,
            // TODO: index, overlayer
        }))
    }
    destroy() {
        this.#observer.unobserve(this)
    }
}

// ORBIS patch 21: a reload of the plugin reads this file again, and an element cannot be defined twice or
// unregistered — so the first definition stands until Obsidian restarts. See ORBIS-CHANGES.md.
if (!customElements.get('foliate-fxl')) customElements.define('foliate-fxl', FixedLayout)
