/*
 * Copyright (C) Camptocamp
 *
 * This file is part of geOrchestra
 *
 * geOrchestra is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with geOrchestra.  If not, see <http://www.gnu.org/licenses/>.
 */

/*
 * @include GeoExt/data/FeatureStore.js
 * @include GeoExt/widgets/grid/FeatureSelectionModel.js
 * @include OpenLayers/Format/GML.js
 * @include OpenLayers/Format/JSON.js
 * @include OpenLayers/Request/XMLHttpRequest.js
 * @include OpenLayers/Layer/Vector.js
 * @include OpenLayers/Geometry/Point.js
 * @include OpenLayers/Renderer/SVG.js
 * @include OpenLayers/Renderer/VML.js
 * @include OpenLayers/Control/SelectFeature.js
 * @include GEOR_waiter.js
 * @include GEOR_ajaxglobal.js
 * @include GEOR_config.js
 * @include GEOR_util.js
 * @include GEOR_FeatureDataModel.js
 */

Ext.namespace("GEOR");

GEOR.ResultsPanel = Ext.extend(Ext.Panel, {

    /**
     * Property: title
     * {String}
     */
    title: OpenLayers.i18n("Search"),

    /**
     * Property: closable
     * {Boolean}
     */
    closable: true,

    /**
     * Property: map
     * {OpenLayers.Map} The map instance.
     */
    map: null,

    /**
     * Property: sfControl
     * {OpenLayers.Control.SelectFeature} The control used for the 
     * feature selection model
     */
    sfControl: null,

    /**
     * Private: store
     * {GeoExt.data.FeatureStore}
     */
    _store: null,

    /**
     * Private: vectorLayer
     * {OpenLayers.Layer.Vector} The vector layer on which we display results
     */
    _vectorLayer: null,

    /**
     * Private: model
     * {GEOR.FeatureDataModel} data model
     */
    _model: null,

    /**
     * Private: layerBounds
     * {OpenLayers.Bounds} The cached vector layer bounds
     */
    _layerBounds: null,

    /**
     * Method: _csvExportBtnHandler
     * Triggers the download dialog for CSV export of the store's content
     */
    _csvExportBtnHandler: function() {
        var t = this._store.getCount();
        if (t === 0) {
            return;
        }
        GEOR.waiter.show();
        var data = new Array(t), att, fields = this._model.getFields();
        for (var i=0; i<t; i++) {
            data[i] = [];
            att = this._store.getAt(i).get('feature').attributes;
            // see http://applis-bretagne.fr/redmine/issues/4084
            for (var j=0, ll=fields.length; j<ll; j++) {
                data[i].push(att[fields[j]] || '');
            }
        }
        var format = new OpenLayers.Format.JSON();
        OpenLayers.Request.POST({
            url: GEOR.config.PATHNAME + "/ws/csv/",
            data: format.write({
                columns: this._model.getFields(), 
                data: data
            }),
            success: function(response) {
                var o = Ext.decode(response.responseText);
                window.location.href = GEOR.config.PATHNAME + "/" + o.filepath;
            }
        });
    },

    /**
     * Method: _zoomToFeatures
     * Sets the map extent in order to see all results
     *
     * Parameters:
     * features - {Array(Openlayers.Feature.Vector)} an optional array of features
     *  If not provided, this method will zoom to the vector layer extent.
     *
     */
    _zoomToFeatures: function(features) {
        var bounds, layerBounds = null;
        var map = this._vectorLayer.map;

        if (features && features[0]) {
            bounds = new OpenLayers.Bounds();
            Ext.each(features, function(f) {
                if (f.bounds) {
                    bounds.extend(f.bounds);
                } else if (f.geometry) {
                    bounds.extend(f.geometry.getBounds());
                }
            });
        } else if (this._vectorLayer.features.length) {
            bounds = this._vectorLayer.getDataExtent();
        } else {
            return;
        }
        if (!bounds || !bounds.left) {
            return;
        }
        if (bounds.getWidth() + bounds.getHeight() !== 0) {
            layerBounds = bounds.scale(1.05);
            map.zoomToExtent(layerBounds);
        } else if (bounds.getWidth() === 0 && bounds.getHeight() === 0) {
            map.setCenter(bounds.getCenterLonLat());
        }
        this._layerBounds = layerBounds;
    },

    /**
     * Method: _zoomToLayerExtent
     * Sets the map extent in order to see all results
     * Caches the vector layer extent if required
     */
    _zoomToLayerExtent: function() {
        if (!this._layerBounds) {
            this._layerBounds = this._zoomToFeatures(this._vectorLayer.features);
        } else {
            this._vectorLayer.map.zoomToExtent(this._layerBounds);
        }
    },

    /**
     * Method: _createVectorLayer
     *
     */
    _createVectorLayer: function() {
        this._vectorLayer = new OpenLayers.Layer.Vector("search_results_"+this.id, {
            displayInLayerSwitcher: false,
            styleMap: GEOR.util.getStyleMap(),
            rendererOptions: {
                zIndexing: true
            }
        });
    },

    /**
     * Method: _createGridPanel
     * Empties the container panel, creates and loads the gridPanel into it
     *
     */
    _createGridPanel: function() {
        var tr = OpenLayers.i18n;

        var columnModel = this._model.toColumnModel({
            sortable: true
        });

        var c = this._store.getCount();
        var plural = (c>1) ? "s" : "";

        var tbtext = new Ext.Toolbar.TextItem({
            text: (c == GEOR.config.MAX_FEATURES) ?
            tr("resultspanel.maxfeature.reached", {
                'NB': GEOR.config.MAX_FEATURES
            }) :
            (c>1) ? tr("NB results", {'NB': c}) :
            (c>0) ? tr("One result") :
            tr("No result")
        });

        var bbar = [
            {
                text: tr("Clean"),
                tooltip: tr("Clean all results on the map and in the table"),
                handler: function() {
                    this._vectorLayer.destroyFeatures();
                    this._layerBounds = null;
                    tbtext.hide();
                },
                scope: this
            }, tbtext, '->', {
                text: tr("Zoom"),
                tooltip: tr("Zoom to results extent"),
                handler: this._zoomToLayerExtent,
                scope: this
            },{
                text: tr("CSV Export"),
                tooltip: tr("Export results as CSV"),
                handler: this._csvExportBtnHandler,
                scope: this
            }
        ];

        if (!this.sfControl) {
            // we need to create the SelectFeature control by ourselves
            // because we need to modify its internal properties
            // and we cannot get a reference to these when the control is created
            // inside the GeoExt.grid.FeatureSelectionModel
            this.sfControl = new OpenLayers.Control.SelectFeature(this._vectorLayer, {
                toggle: true,
                multipleKey: Ext.isMac ? "metaKey" : "ctrlKey"
            });
            this.map.addControl(this.sfControl);
            // see http://applis-bretagne.fr/redmine/issues/1983
            this.sfControl.handlers.feature.stopDown = false;
        }
        this.removeAll();
        var me = this;
        this.add({
            xtype: "grid",
            viewConfig: {
                // we add an horizontal scroll bar in case
                // there are too many attributes to display:
                forceFit: (columnModel.length < 10)
            },
            store: this._store,
            columns: columnModel,
            sm: new GeoExt.grid.FeatureSelectionModel({
                singleSelect: false,
                selectControl: this.sfControl
            }),
            frame: false,
            border: false,
            buttonAlign: 'left',
            bbar: bbar,
            listeners: {
                "rowdblclick": function(grid, rowIndex, e) {
                    me._zoomToFeatures([me._store.getAt(rowIndex).get('feature')]);
                },
                "beforedestroy": function() {
                    me._vectorLayer.destroyFeatures();
                    me._layerBounds = null;
                    this.selModel.unbind(); // required to handle issue 256
                    // http://applis-bretagne.fr/redmine/issues/show/256
                    // this deactivates Feature handler,
                    // and moves search_results layer back to normal z-index
                    return true;
                }
            }
        });
    },

    /**
     * Method: populate
     * Callback executed when we receive the XML data.
     *
     * Parameters:
     * options - {Object} Hash with keys: features, addLayerToMap and model (both optional)
     * addLayerToMap defaults to true
     */
    populate: function(options) {
        var tr = OpenLayers.i18n;

        // we clear the bounds cache:
        this._layerBounds = null;

        var features = options.features;
        if (!features || features.length === 0) {
            GEOR.waiter.hide();
            this._vectorLayer && this._vectorLayer.removeAllFeatures();
            this.removeAll();
            this.add({
                bodyStyle: 'padding:1em;',
                html: tr("<p>No result for that request.</p>")
            });
            return;
        }
        if (!this._vectorLayer) {
            this._createVectorLayer();
        }

        if (options.addLayerToMap !== false) {
            if (OpenLayers.Util.indexOf(this.map.layers, this._vectorLayer) < 0) {
                this.map.addLayer(this._vectorLayer);
            }
        } else if (OpenLayers.Util.indexOf(this.map.layers, this._vectorLayer) >= 0) {
            this.map.removeLayer(this._vectorLayer);
        }

        if (options.model) {
            this._model = options.model;
        } else {
            // we need to compute the model from the features we got.
            this._model = new GEOR.FeatureDataModel({
                features: features
            });
        }

        this._store = new GeoExt.data.FeatureStore({
            layer: this._vectorLayer,
            fields: this._model.toStoreFields()/*,
            initDir: (options.addLayerToMap === false) ? 
                GeoExt.data.FeatureStore.LAYER_TO_STORE : 
                GeoExt.data.FeatureStore.LAYER_TO_STORE|GeoExt.data.FeatureStore.STORE_TO_LAYER
            */
        });

        Ext.each(features, function(f, i) {
            // In case we just have a bounds object and no geom,
            // display the bounding box
            if (f.bounds && !f.geometry) {
                if (f.bounds.getWidth() + f.bounds.getHeight() == 0) {
                    // bounds of a single point => create a true point
                    features[i].geometry = new OpenLayers.Geometry.Point(
                        f.bounds.left, f.bounds.top
                    );
                } else {
                    // general case where bounds is a true polygon
                    features[i].geometry = f.bounds.toGeometry();
                }
            }
            // transform URLs into true links
            // see http://applis-bretagne.fr/redmine/issues/4505
            Ext.iterate(f.attributes, function(k, v, o) {
                if (GEOR.util.isUrl(v, false)) {
                    o[k] = '<a href="'+v+'" target="_blank">'+v+'</a>';
                }
            });
        });
        this._store.loadData(features);
        this._createGridPanel();
    },

    /**
     * APIMethod: clean
     * This method destroys the features in the vector layer.
     *
     */
    clean: function() {
        if (this._vectorLayer) {
            this._vectorLayer.setVisibility(false);
            this._layerBounds = null;
        }
    },

    /**
     * APIMethod: lower
     * Hides the attached vector layer.
     */
    lower: function() {
        if (this._vectorLayer) {
            this._vectorLayer.setVisibility(false);
        }
    },

    /**
     * APIMethod: raise
     * Displays the attached vector layer.
     */
    raise: function() {
        if (this._vectorLayer) {
            this._vectorLayer.setVisibility(true);
        }
    }

});
