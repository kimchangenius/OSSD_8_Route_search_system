import L from "leaflet";

if (!L.DomUtil.setTransform) {
    L.DomUtil.setTransform = (el, offset = new L.Point(0, 0), scale) => {
        const pos = offset;
        el.style[L.DomUtil.TRANSFORM] =
            (L.Browser.ie3d
                ? `translate(${pos.x}px, ${pos.y}px)`
                : `translate3d(${pos.x}px, ${pos.y}px, 0)`) +
            (scale ? ` scale(${scale})` : "");
    };
}

L.CanvasLayer = (L.Layer || L.Class).extend({
    initialize(options) {
        this._map = null;
        this._canvas = null;
        this._frame = null;
        this._delegate = null;
        L.setOptions(this, options);
    },

    delegate(del) {
        this._delegate = del;
        return this;
    },

    needRedraw() {
        if (!this._frame) {
            this._frame = L.Util.requestAnimFrame(this.drawLayer, this);
        }
        return this;
    },

    _onLayerDidResize(e) {
        this._canvas.width = e.newSize.x;
        this._canvas.height = e.newSize.y;
    },

    _updatePosition() {
        const topLeft = this._map.containerPointToLayerPoint([0, 0]);
        L.DomUtil.setPosition(this._canvas, topLeft);
    },

    _onLayerDidMove() {
        this._updatePosition();
        this.drawLayer();
    },

    getEvents() {
        const events = {
            resize: this._onLayerDidResize,
            moveend: this._onLayerDidMove,
            zoom: this._onLayerDidMove,
        };
        if (this._map.options.zoomAnimation && L.Browser.any3d) {
            events.zoomanim = this._animateZoom;
        }
        return events;
    },

    onAdd(map) {
        this._map = map;
        this._canvas = L.DomUtil.create("canvas", "leaflet-layer");
        // 배경색 제거 또는 투명하게 설정
        this._canvas.style.background = "transparent";

        const size = this._map.getSize();
        this._canvas.width = size.x;
        this._canvas.height = size.y;

        const animated = this._map.options.zoomAnimation && L.Browser.any3d;
        L.DomUtil.addClass(
            this._canvas,
            "leaflet-zoom-" + (animated ? "animated" : "hide")
        );

        map.getPanes().overlayPane.appendChild(this._canvas);
        map.on(this.getEvents(), this);

        const del = this._delegate || this;
        if (del.onLayerDidMount) del.onLayerDidMount();
        this._updatePosition();
        this.needRedraw();
        console.log("CanvasLayer added to map");
    },

    onRemove(map) {
        const del = this._delegate || this;
        if (del.onLayerWillUnmount) del.onLayerWillUnmount();

        if (this._frame) {
            L.Util.cancelAnimFrame(this._frame);
        }

        map.getPanes().overlayPane.removeChild(this._canvas);
        map.off(this.getEvents(), this);
        this._canvas = null;
        console.log("CanvasLayer removed from map");
    },

    addLayer(map) {
        map.addLayer(this);
        console.log("CanvasLayer added to map");
        return this;
    },

    LatLonToMercator(latlon) {
        const {lat, lng} = latlon;
        return {
            x: (lng * 6378137 * Math.PI) / 180,
            y: Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) * 6378137,
        };
    },

    drawLayer() {
        if (!this._map) return;

        const size = this._map.getSize();
        const bounds = this._map.getBounds();
        const zoom = this._map.getZoom();
        const center = this.LatLonToMercator(this._map.getCenter());
        const corner = this.LatLonToMercator(
            this._map.containerPointToLatLng(this._map.getSize())
        );

        const del = this._delegate || this;
        if (del.onDrawLayer) {
            del.onDrawLayer({
                layer: this,
                canvas: this._canvas,
                bounds,
                size,
                zoom,
                center,
                corner,
            });
        }
        this._frame = null;
    },

    _animateZoom(e) {
        const scale = this._map.getZoomScale(e.zoom);
        const offset =
            L.Layer
                ? this._map._latLngBoundsToNewLayerBounds(
                    this._map.getBounds(),
                    e.zoom,
                    e.center
                ).min
                : this._map
                    ._getCenterOffset(e.center)
                    .multiplyBy(-scale)
                    .subtract(this._map._getMapPanePos());
        L.DomUtil.setTransform(this._canvas, offset, scale);
    },
});

L.canvasLayer = function () {
    return new L.CanvasLayer();
};

export default L.canvasLayer;