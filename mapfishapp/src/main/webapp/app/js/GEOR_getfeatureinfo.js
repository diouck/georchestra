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
 * @include OpenLayers/Control/WMSGetFeatureInfo.js
 * @include OpenLayers/Control/WMTSGetFeatureInfo.js
 * @include OpenLayers/Format/WMSGetFeatureInfo.js
 * @include OpenLayers/Projection.js
 * @include GEOR_FeatureDataModel.js
 */

Ext.namespace("GEOR");

GEOR.getfeatureinfo = (function() {

    /*
     * Private
     */

    var observable = new Ext.util.Observable();
    observable.addEvents(
        /**
         * Event: searchresults
         * Fires when we've received a response from server
         *
         * Listener arguments:
         * options - {Object} A hash containing response, model and format
         */
        "searchresults",
        /**
         * Event: search
         * Fires when the user presses the search button
         *
         * Listener arguments:
         * panelCfg - {Object} Config object for a panel
         */
        "search",
        /**
         * Event: shutdown
         * Fires when GFI tool is deactivated
         *
         */
        "shutdown"
    );

    /**
     * Property: ctrl
     * {OpenLayers.Control.WMSGetFeatureInfo} The control.
     */
    var ctrl = null;

    /**
     * Equal to true if a research is launched on multiple layers
     * and false if it is on a single layer.
     * If true, it will force the model to be recreated from the features (see onGetfeatureinfo).
     */
    var Xsearch = null;

    /**
     * Property: map
     * {OpenLayers.Map} The map instance.
     */
    var map = null;

    /**
     * Property: model
     * {GEOR.FeatureDataModel} data model
     */
    var model = null;

    /**
     * Property: tr
     * {Function} an alias to OpenLayers.i18n
     */
    var tr = null;

    var layerStore = null;

    /**
     * Method: onGetfeatureinfo
     * Callback executed when the GetFeatureInfo response
     * is received.
     *
     * Parameters:
     * info - {Object} Hash of options, with keys: text, features, request, xy.
     */
    var onGetfeatureinfo = function(info) {
        OpenLayers.Element.addClass(map.viewPortDiv, "olDrawBox");

        var features = info.features;
        var layerTitle = null;

        for(var i = 0; i < info.object.layers.length && features.length > 0; i++) {
            if(features[0].gml.featureType == ctrl.layers[i].params.LAYERS) {
                layerTitle = GEOR.util.shortenLayerName(ctrl.layers[i]);
            }
        }

        /* reset model too if we come from a multi-layer query */
        if (!model || model.isEmpty() || Xsearch) {
            model = new GEOR.FeatureDataModel({
                features: features
            });
        }

        // Features on-the-fly client-side reprojection (this is a hack, OK)
        // Discussion happened in https://github.com/georchestra/georchestra/issues/254
        
        /*
         * We're typically getting this kind of string in the GML:
         *  gml:MultiPolygon srsName="http://www.opengis.net/gml/srs/epsg.xml#3948"
         */
        var r =  /[^]+srsName=\"(.+?)\"[^]+/.exec(info.text);
        if (r) {
            var srsString = r[1];
            /*
             * At this stage, we have to normalize these kinds of strings:
             * http://www.opengis.net/gml/srs/epsg.xml#2154
             * http://www.opengis.net/def/crs/EPSG/0/4326
             * urn:x-ogc:def:crs:EPSG:4326
             * urn:ogc:def:crs:EPSG:4326
             * EPSG:2154
             */
            var srsName = srsString.replace(/.+[#:\/](\d+)$/, "EPSG:$1");
            
            if (map.getProjection() !== srsName) {
                var sourceSRS = new OpenLayers.Projection(srsName),
                    destSRS = map.getProjectionObject();
                Ext.each(features, function(f) {
                    f.geometry.transform(sourceSRS, destSRS);
                    if (f.bounds && !!f.bounds.transform) {
                        f.bounds.transform(sourceSRS, destSRS);
                    }
                });
            }
        }

        observable.fireEvent("searchresults", {
            features: features,
            model: model,
            title: layerTitle
            // we do not know the model with GFI at first time.
            // but at second time, we can use cached model
        });
    };

    var onGetXfeatureinfo = function(info) {
        OpenLayers.Element.addClass(map.viewPortDiv, "olDrawBox");

        var features = [];
        var Xmodel = [];
        var layerTitle = [];

        for(var i = 0; i < info.features.length; i++){
            features[i] = [info.features[i]];
            for(var iii = 0; iii < info.object.layers.length; iii++) {
                if(info.features[i].gml.featureType == ctrl.layers[iii].params.LAYERS) {
                    layerTitle.push(GEOR.util.shortenLayerName(ctrl.layers[iii]));
                }
            }
            var ii = i+1;
            while(ii < info.features.length) {
                if(info.features[i].gml.featureType == info.features[ii].gml.featureType) {
                    features[i].push(info.features[ii]);
                    delete info.features[ii];
                    info.features.splice(ii,1);
                }
                else {
                    ii++;
                }
            }
            Xmodel.push(new GEOR.FeatureDataModel({
                features: features[i][0]
            }));
        }

        observable.fireEvent("searchXresults", {
            features: features,
            model: Xmodel,
            title: layerTitle
            // we do not know the model with GFI at first time.
            // but at second time, we can use cached model
        });
    };

    /**
     * Method: onBeforegetfeatureinfo
     * Callback executed just before getFeatureInfo request is triggered
     */
    var onBeforegetfeatureinfo = function() {
        // to let OL use its own cursor class:
        OpenLayers.Element.removeClass(map.viewPortDiv, "olDrawBox");

        var msg;
        if(ctrl.layers.length > 0) {
            msg = "<div>Searching...</div>";
        } else {
            msg = "<div>No layer selected</div>";
        }

        observable.fireEvent("search", {
            html: tr(msg)
        });
    };

    /**
     * Method: onLayerVisibilitychanged
     * Callback executed on WMS layer visibility changed
     * We need to deactivate ourselves or update the list of layers queried
     */
    var onLayerVisibilitychanged = function() {
        /* update ctrl.layers if we're in a multi-layer query */
        if (Xsearch) {
            layers = [];
            for(var i = 0; i < layerStore.data.length; i++) {
                var layerRecord = layerStore.getAt(i);
                if(layerRecord.get("queryable") && layerRecord.getLayer().visibility == true) {
                    layers.push(layerRecord.getLayer());
                }
            }
            ctrl.layers = layers;
        } else {
            if (!ctrl.layers[0].visibility) {
                this.toggle(ctrl.layers[0], false);
            }
        }
    };

    /**
     * Method: onLayerRemoved
     * Callback executed on WMS layer removed from map
     * We need to deactivate ourselves or update the list of layers queried
     */
    var onLayerRemoved = function(options) {
        /* remove options.layer from ctrl.layers if it was being queried in a multi-layer query */
        if (Xsearch) {
            for(var i = 0; i < ctrl.layers.length; i++) {
                if (options.layer === ctrl.layers[i]) {
                    ctrl.layers.splice(i, 1);
                    break;
                }
            }
        } else {
            if (options.layer === ctrl.layers[0]) {
                this.toggle(options.layer, false);
            }
        }
    };

    /**
     * Method: onCtrlactivate
     * Callback executed on control activation
     */
    var onCtrlactivate = function() {
        OpenLayers.Element.addClass(map.viewPortDiv, "olDrawBox");
    };

    /**
     * Method: onCtrldeactivate
     * Callback executed on control deactivation
     */
    var onCtrldeactivate = function() {
        OpenLayers.Element.removeClass(map.viewPortDiv, "olDrawBox");
    };

    /*
     * Public
     */

    return {
        /*
         * Observable object
         */
        events: observable,

        /**
         * APIMethod: init
         * Initialize this module
         *
         * Parameters:
         * m - {OpenLayers.Map} The map instance.
         */
        init: function(l) {
            tr = OpenLayers.i18n;
            map = l.map;
            layerStore = l;
        },

        /**
         * APIMethod: toggle
         *
         * Parameters:
         * record - {GeoExt.data.LayerRecord | OpenLayers.Layer.WMS} the layer
         * state - {Boolean} Toggle to true or false this layer ?
         */
        toggle: function(record, state) {
            var layer, title, type;
            if (record instanceof OpenLayers.Layer.WMS) {
                layer = record;
                title = layer.name;
                type = "WMS";
            } else if (record instanceof GeoExt.data.LayerRecord) {
                layer = record.get("layer");
                title = record.get("title");
                type = record.get("type");
            }
            if (state) {
                Xsearch = false;
                observable.fireEvent("search", {
                    html: tr("<div>Search on objects active for NAME layer. " +
                             "Clic on the map.</div>",
                             {'NAME': title})
                });

                var ctrlEventsConfig = {
                    "beforegetfeatureinfo": onBeforegetfeatureinfo,
                    "getfeatureinfo": onGetfeatureinfo,
                    "activate": onCtrlactivate,
                    "deactivate": onCtrldeactivate,
                    scope: this
                };

                // we'd like to activate gfi request on layer
                if (ctrl) {
                    ctrl.events.un(ctrlEventsConfig);
                    ctrl.destroy();
                }
                var controlClass = (type === "WMS") ? 
                    OpenLayers.Control.WMSGetFeatureInfo :
                    OpenLayers.Control.WMTSGetFeatureInfo;

                ctrl = new controlClass({
                    layers: [layer],
                    maxFeatures: GEOR.config.MAX_FEATURES,
                    infoFormat: 'application/vnd.ogc.gml'
                });
                ctrl.events.on(ctrlEventsConfig);
                map.addControl(ctrl);
                ctrl.activate();

                layer.events.on({
                    "visibilitychanged": onLayerVisibilitychanged,
                    scope: this
                });
                map.events.on({
                    "removelayer": onLayerRemoved,
                    scope: this
                });

            } else {
                // clear model cache:
                model = null;
                // test for layers array size to see if we're not switching
                // from a single gfi to a multiple gfi - in that case we dont
                // want to collapse the south panel
                if (ctrl.layers[0] === layer && ctrl.layers.length == 1) {
                    // we clicked on a toolbar button, which means we have
                    // to stop gfi requests.
                    //
                    // note: IE produces a js error when reloading the page
                    // with the gfi control activated, this is because
                    // ctrl.deactivate() is called here while the control
                    // has been destroyed and its events property set to
                    // null, let's guard against that by not attempting
                    // to deactivate the control if ctrl.events is null.
                    if (ctrl.events !== null) {
                        ctrl.deactivate();
                    }
                    // we need to collapse the south panel.
                    observable.fireEvent("shutdown");
                } else {
                    // we asked for gfi on another layer
                }
                // in either case, we clean events on ctrl's layer
                ctrl.layers[0].events.un({
                    "visibilitychanged": onLayerVisibilitychanged,
                    scope: this
                });
                map.events.un({
                    "removelayer": onLayerRemoved,
                    scope: this
                });
            }
        },

        //copy of the function toggle in order to query several layers at once
        toggleX: function(state) {
            var layers = [];
            for(var i = 0; i < layerStore.data.length; i++) {
                var layerRecord = layerStore.getAt(i);
                if(layerRecord.get("queryable") && layerRecord.getLayer().visibility == true) {
                    layers.push(layerRecord.getLayer());
                }
            }
            if(layers.length > 0) {
                if (state) {
                    Xsearch = true;
                    observable.fireEvent("search", {
                        html: tr("Search on all active layers")
                    });

                    var ctrlEventsConfig = {
                        "beforegetfeatureinfo": onBeforegetfeatureinfo,
                        "getfeatureinfo": onGetXfeatureinfo,
                        "activate": onCtrlactivate,
                        "deactivate": onCtrldeactivate,
                        scope: this
                    };

                    // we'd like to activate gfi request on layer
                    if (ctrl) {
                        ctrl.events.un(ctrlEventsConfig);
                        ctrl.destroy();
                    }
                    ctrl = new OpenLayers.Control.WMSGetFeatureInfo({
                        layers: layers,
                        maxFeatures: GEOR.config.MAX_FEATURES,
                        infoFormat: 'application/vnd.ogc.gml'
                    });
                    ctrl.events.on(ctrlEventsConfig);
                    map.addControl(ctrl);
                    ctrl.activate();
                    for(var i = 0; i < layers.length; i++){
                        layers[i].events.on({
                            "visibilitychanged": onLayerVisibilitychanged,
                            scope: this
                        });
                    }
                    map.events.on({
                        "removelayer": onLayerRemoved,
                        scope: this
                    });

                } else {
                    // clear model cache:
                    model = null;
                    var collapse;
                    if(!ctrl || layers.length == ctrl.layers.length) {
                        collapse= true;
                        if(ctrl) {
                            for(var i = 0; i < layers.length; i++) {
                                if(ctrl.layers[i] != layers[i]) {
                                    collapse = false;
                                }
                            }
                        }
                    }
                    else {
                        collapse = false;
                    }
                    if (collapse) {
                        // we clicked on a toolbar button, which means we have
                        // to stop gfi requests.
                        //
                        // note: IE produces a js error when reloading the page
                        // with the gfi control activated, this is because
                        // ctrl.deactivate() is called here while the control
                        // has been destroyed and its events property set to
                        // null, let's guard against that by not attempting
                        // to deactivate the control if ctrl.events is null.
                        if (ctrl.events !== null) {
                            ctrl.deactivate();
                        }
                        // we need to collapse the south panel.
                        observable.fireEvent("shutdown");
                    } else {
                        // we asked for gfi on another layer
                    }
                    // in either case, we clean events on ctrl's layers
                    for(var i = 0; i < ctrl.layers.length; i++) {
                        ctrl.layers[i].events.un({
                            "visibilitychanged": onLayerVisibilitychanged,
                            scope: this
                        });
                    }
                    map.events.un({
                        "removelayer": onLayerRemoved,
                        scope: this
                    });
                }
            } else {
                observable.fireEvent("search", {
                    html: tr("No active layers.")
                });
                observable.fireEvent("shutdown");
            }
       }
   };
})();


