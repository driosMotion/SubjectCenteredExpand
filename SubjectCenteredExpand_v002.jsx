#target photoshop

(function () {
    // Version 2 embeds Photoshop's Generative Expand crop command directly.
    // The square master is twice the longest source dimension.
    var EXPAND_FACTOR = 2.0;
    var XMP_NS = "https://example.local/subject-centered-expand/1.0/";
    var XMP_PREFIX = "sce:";
    var ratios = [
        { label: "2:3", suffix: "2x3", width: 2, height: 3 },
        { label: "3:4", suffix: "3x4", width: 3, height: 4 },
        { label: "4:5", suffix: "4x5", width: 4, height: 5 },
        { label: "9:16", suffix: "9x16", width: 9, height: 16 },
        { label: "3:2", suffix: "3x2", width: 3, height: 2 },
        { label: "4:3", suffix: "4x3", width: 4, height: 3 },
        { label: "5:4", suffix: "5x4", width: 5, height: 4 },
        { label: "16:9", suffix: "16x9", width: 16, height: 9 }
    ];
    var positions = [
        { key: "top-left", label: "Top left", x: 1 / 6, y: 1 / 6 },
        { key: "top-center", label: "Top center", x: 1 / 2, y: 1 / 6 },
        { key: "top-right", label: "Top right", x: 5 / 6, y: 1 / 6 },
        { key: "middle-left", label: "Middle left", x: 1 / 6, y: 1 / 2 },
        { key: "middle-center", label: "Middle center", x: 1 / 2, y: 1 / 2 },
        { key: "middle-right", label: "Middle right", x: 5 / 6, y: 1 / 2 },
        { key: "bottom-left", label: "Bottom left", x: 1 / 6, y: 5 / 6 },
        { key: "bottom-center", label: "Bottom center", x: 1 / 2, y: 5 / 6 },
        { key: "bottom-right", label: "Bottom right", x: 5 / 6, y: 5 / 6 }
    ];

    // ExtendScript Document.crop([l,t,r,b]) is NOT origin/size — it centers a box of
    // that size on the document, so every variant came out centered regardless of the
    // selected subject position. Crop deterministically with anchored resizeCanvas
    // instead: trim the right/bottom edges anchored TOPLEFT (origin stays put), then
    // trim the left/top edges anchored BOTTOMRIGHT (kept content stays put).
    function cropToBounds(doc, bounds) {
        var boxLeft = Math.round(bounds.left);
        var boxTop = Math.round(bounds.top);
        var boxRight = Math.round(bounds.right);
        var boxBottom = Math.round(bounds.bottom);
        var boxWidth = boxRight - boxLeft;
        var boxHeight = boxBottom - boxTop;
        if (boxWidth < 1 || boxHeight < 1) {
            throw new Error("Crop box collapsed to zero pixels.");
        }
        var currentHeight = Number(doc.height.as("px"));
        // 1. Trim right, then bottom (anchor TOPLEFT keeps the origin fixed).
        doc.resizeCanvas(UnitValue(boxRight, "px"), UnitValue(currentHeight, "px"), AnchorPosition.TOPLEFT);
        doc.resizeCanvas(UnitValue(boxRight, "px"), UnitValue(boxBottom, "px"), AnchorPosition.TOPLEFT);
        // 2. Now the kept box starts at (boxLeft, boxTop): trim left, then top
        //    (anchor BOTTOMRIGHT keeps the kept content anchored to the far corner).
        doc.resizeCanvas(UnitValue(boxWidth, "px"), UnitValue(boxBottom, "px"), AnchorPosition.BOTTOMRIGHT);
        doc.resizeCanvas(UnitValue(boxWidth, "px"), UnitValue(boxHeight, "px"), AnchorPosition.BOTTOMRIGHT);
    }

    // BEGIN GEOMETRY
    function clamp(value, minimum, maximum) {
        return Math.min(Math.max(value, minimum), maximum);
    }

    function computePreparedGeometry(originalWidth, originalHeight, fractionX, fractionY) {
        var baseSize = Math.max(originalWidth, originalHeight);
        var masterSize = baseSize * EXPAND_FACTOR;
        // Keep crop bounds on whole pixels. When a margin is odd, the extra pixel
        // goes on the right/bottom side.
        var sourceLeft = Math.floor((masterSize - originalWidth) / 2);
        var sourceTop = Math.floor((masterSize - originalHeight) / 2);
        var sourceMarginRight = masterSize - originalWidth - sourceLeft;
        var sourceMarginBottom = masterSize - originalHeight - sourceTop;
        return {
            baseSize: baseSize,
            masterWidth: masterSize,
            masterHeight: masterSize,
            sourceLeft: sourceLeft,
            sourceTop: sourceTop,
            sourceMarginRight: sourceMarginRight,
            sourceMarginBottom: sourceMarginBottom,
            sourceRight: sourceLeft + originalWidth,
            sourceBottom: sourceTop + originalHeight,
            subjectX: sourceLeft + fractionX * originalWidth,
            subjectY: sourceTop + fractionY * originalHeight
        };
    }

    function computeCropBounds(masterWidth, masterHeight, originalSize, subjectX, subjectY, desiredX, desiredY, ratioWidth, ratioHeight) {
        var cropWidth;
        var cropHeight;
        var idealLeft;
        var idealTop;
        var left;
        var top;
        if (ratioWidth < ratioHeight) {
            cropWidth = originalSize;
            cropHeight = originalSize * ratioHeight / ratioWidth;
        } else {
            cropWidth = originalSize * ratioWidth / ratioHeight;
            cropHeight = originalSize;
        }
        if (cropWidth > masterWidth + 0.01 || cropHeight > masterHeight + 0.01) {
            throw new Error("The requested ratio does not fit inside the " + EXPAND_FACTOR + "x master.");
        }
        idealLeft = subjectX - desiredX * cropWidth;
        idealTop = subjectY - desiredY * cropHeight;
        left = clamp(idealLeft, 0, masterWidth - cropWidth);
        top = clamp(idealTop, 0, masterHeight - cropHeight);
        return {
            left: left,
            top: top,
            right: left + cropWidth,
            bottom: top + cropHeight,
            width: cropWidth,
            height: cropHeight,
            constrained: Math.abs(left - idealLeft) > 0.01 || Math.abs(top - idealTop) > 0.01
        };
    }
    // END GEOMETRY

    function pixelValue(value) {
        return Number(value.as("px"));
    }

    function safeBaseName(name) {
        var base = String(name || "image").replace(/\.[^.]+$/, "");
        base = base.replace(/[<>:"\/\\|?*\x00-\x1F]/g, "_").replace(/[. ]+$/g, "");
        return base || "image";
    }

    function activeSavedImage() {
        var doc;
        var file;
        var width;
        var height;
        if (!app.documents.length) throw new Error("Open an image in Photoshop first.");
        doc = app.activeDocument;
        try { file = doc.fullName; } catch (error) { file = null; }
        if (!file || !file.exists) throw new Error("Save the source document locally before running this script.");
        width = pixelValue(doc.width);
        height = pixelValue(doc.height);
        if (!(width > 0) || !(height > 0)) throw new Error("Photoshop did not return usable pixel dimensions.");
        return {
            doc: doc, file: file, width: width, height: height,
            baseSize: Math.max(width, height),
            baseName: safeBaseName(file.name), parent: file.parent
        };
    }

    function generativeExpandDocument(doc, geometry) {
        app.activeDocument = doc;
        var crop = new ActionDescriptor();
        var rectangle = new ActionDescriptor();
        rectangle.putUnitDouble(charIDToTypeID("Top "), charIDToTypeID("#Pxl"), -geometry.sourceTop);
        rectangle.putUnitDouble(charIDToTypeID("Left"), charIDToTypeID("#Pxl"), -geometry.sourceLeft);
        rectangle.putUnitDouble(charIDToTypeID("Btom"), charIDToTypeID("#Pxl"), pixelValue(doc.height) + geometry.sourceMarginBottom);
        rectangle.putUnitDouble(charIDToTypeID("Rght"), charIDToTypeID("#Pxl"), pixelValue(doc.width) + geometry.sourceMarginRight);
        crop.putObject(charIDToTypeID("T   "), charIDToTypeID("Rctn"), rectangle);
        crop.putUnitDouble(charIDToTypeID("Angl"), charIDToTypeID("#Ang"), 0);
        crop.putBoolean(charIDToTypeID("Dlt "), true);
        crop.putInteger(stringIDToTypeID("AutoFillMethod"), 0);
        crop.putEnumerated(stringIDToTypeID("cropFillMode"), stringIDToTypeID("cropFillMode"), stringIDToTypeID("generative"));

        // Preserve the workflow routing recorded by Photoshop's Generative Expand action.
        var workflowMap = new ActionDescriptor();
        var workflowNames = [
            "gen_harmonize", "generativeUpscale", "instruct_edit", "text_to_image",
            "generate_similar", "out_painting", "generate_background", "in_painting"
        ];
        for (var index = 0; index < workflowNames.length; index += 1) {
            workflowMap.putString(stringIDToTypeID(workflowNames[index]), index === 1 ? "clio_upscaler" : "clio3");
        }
        crop.putObject(stringIDToTypeID("workflow_to_active_service_identifier_map"), stringIDToTypeID("null"), workflowMap);
        crop.putEnumerated(
            stringIDToTypeID("cropAspectRatioModeKey"),
            stringIDToTypeID("cropAspectRatioModeClass"),
            stringIDToTypeID("pureAspectRatio")
        );
        crop.putBoolean(charIDToTypeID("CnsP"), true);
        executeAction(stringIDToTypeID("crop"), crop, DialogModes.NO);
    }

    function ensureXMP() {
        if (ExternalObject.AdobeXMPScript === undefined) {
            ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript");
        }
        XMPMeta.registerNamespace(XMP_NS, XMP_PREFIX);
    }

    function writePreparedMetadata(doc, info) {
        ensureXMP();
        var xmp = new XMPMeta(doc.xmpMetadata.rawData);
        var fields = ["schema", "originalWidth", "originalHeight", "baseSize", "subjectX", "subjectY", "desiredX", "desiredY", "position", "sourceBaseName", "sourceParent"];
        var values = ["2", info.originalWidth, info.originalHeight, info.baseSize, info.subjectX, info.subjectY, info.desiredX, info.desiredY, info.position, info.sourceBaseName, info.sourceParent];
        var index;
        for (index = 0; index < fields.length; index += 1) xmp.setProperty(XMP_NS, fields[index], String(values[index]));
        doc.xmpMetadata.rawData = xmp.serialize();
    }

    function readPreparedMetadata(doc) {
        try {
            ensureXMP();
            var xmp = new XMPMeta(doc.xmpMetadata.rawData);
            function value(name) {
                var property = xmp.getProperty(XMP_NS, name);
                return property ? property.toString() : "";
            }
            if (value("schema") !== "2") return null;
            var info = {
                originalWidth: Number(value("originalWidth")), originalHeight: Number(value("originalHeight")),
                baseSize: Number(value("baseSize")), subjectX: Number(value("subjectX")), subjectY: Number(value("subjectY")),
                desiredX: Number(value("desiredX")), desiredY: Number(value("desiredY")), position: value("position"),
                sourceBaseName: value("sourceBaseName"), sourceParent: value("sourceParent")
            };
            if (!(info.originalWidth > 0) || !(info.originalHeight > 0) || !(info.baseSize > 0) || isNaN(info.subjectX) || isNaN(info.subjectY) || isNaN(info.desiredX) || isNaN(info.desiredY) || !info.sourceBaseName || !info.sourceParent) return null;
            if (Math.abs(pixelValue(doc.width) - EXPAND_FACTOR * info.baseSize) > 0.01 || Math.abs(pixelValue(doc.height) - EXPAND_FACTOR * info.baseSize) > 0.01) return null;
            return info;
        } catch (error) {
            return null;
        }
    }

    function prepareDocument(source, position, duplicate, runGenerativeExpand) {
        var doc = source.doc;
        var geometry = computePreparedGeometry(source.width, source.height, position.x, position.y);
        if (duplicate) doc = source.doc.duplicate(source.baseName + " - expand", false);
        var info = {
            originalWidth: source.width, originalHeight: source.height, baseSize: geometry.baseSize,
            subjectX: geometry.subjectX, subjectY: geometry.subjectY,
            desiredX: position.x, desiredY: position.y, position: position.key,
            sourceBaseName: source.baseName, sourceParent: source.parent.fsName
        };
        writePreparedMetadata(doc, info);
        app.activeDocument = doc;
        if (runGenerativeExpand) {
            generativeExpandDocument(doc, geometry);
        } else {
            doc.resizeCanvas(UnitValue(geometry.masterWidth, "px"), UnitValue(geometry.masterHeight, "px"), AnchorPosition.MIDDLECENTER);
        }
        return { doc: doc, info: info };
    }

    function selectedRatios(checkboxes) {
        var selected = [];
        var index;
        for (index = 0; index < ratios.length; index += 1) if (checkboxes[index].value) selected.push(ratios[index]);
        return selected;
    }

    function runNames(baseName, selected, runIndex) {
        var suffix = runIndex > 1 ? "_" + runIndex : "";
        var names = { psd: baseName + "_expand" + suffix + ".psd", pngs: [] };
        var index;
        for (index = 0; index < selected.length; index += 1) names.pngs.push(baseName + "_expand_" + selected[index].suffix + suffix + ".png");
        return names;
    }

    function chooseRunIndex(folder, baseName, selected) {
        var index = 1;
        while (true) {
            var names = runNames(baseName, selected, index);
            var conflict = File(folder.fsName + "/" + names.psd).exists;
            var item;
            for (item = 0; item < names.pngs.length; item += 1) if (File(folder.fsName + "/" + names.pngs[item]).exists) conflict = true;
            if (!conflict) return index;
            index += 1;
        }
    }

    function exportPrepared(doc, info, selected) {
        if (!info) throw new Error("Run first, or activate a prepared master containing valid script metadata.");
        if (!selected.length) throw new Error("Select at least one export ratio.");
        var folder = Folder(info.sourceParent + "/" + info.sourceBaseName + "_Adaptations");
        if (!folder.exists && !folder.create()) throw new Error("Could not create the Adaptations folder beside the source.");
        var runIndex = chooseRunIndex(folder, info.sourceBaseName, selected);
        var names = runNames(info.sourceBaseName, selected, runIndex);
        var psdOptions = new PhotoshopSaveOptions();
        psdOptions.layers = true;
        psdOptions.embedColorProfile = true;
        doc.saveAs(File(folder.fsName + "/" + names.psd), psdOptions, true, Extension.LOWERCASE);
        var pngOptions = new PNGSaveOptions();
        pngOptions.interlaced = false;
        var failures = [];
        var constrained = 0;
        var index;
        for (index = 0; index < selected.length; index += 1) {
            var variant = null;
            try {
                var ratio = selected[index];
                var bounds = computeCropBounds(EXPAND_FACTOR * info.baseSize, EXPAND_FACTOR * info.baseSize, info.baseSize, info.subjectX, info.subjectY, info.desiredX, info.desiredY, ratio.width, ratio.height);
                if (bounds.constrained) constrained += 1;
                variant = doc.duplicate(names.pngs[index].replace(/\.png$/i, ""), false);
                cropToBounds(variant, bounds);
                variant.saveAs(File(folder.fsName + "/" + names.pngs[index]), pngOptions, true, Extension.LOWERCASE);
            } catch (error) {
                failures.push(selected[index].label + ": " + error.message);
            } finally {
                if (variant) variant.close(SaveOptions.DONOTSAVECHANGES);
            }
        }
        var message = "Saved one layered master PSD and " + (selected.length - failures.length) + "/" + selected.length + " PNGs in " + folder.fsName + ".";
        if (constrained) message += " " + constrained + " crop(s) used the nearest valid placement.";
        if (failures.length) message += "\n\nFailures:\n" + failures.join("\n");
        return message;
    }

    var oldUnits = app.preferences.rulerUnits;
    app.preferences.rulerUnits = Units.PIXELS;
    try {
        var dialog = new Window("dialog", "Subject-Centered Expand");
        dialog.orientation = "column";
        dialog.alignChildren = "fill";
        var positionPanel = dialog.add("panel", undefined, "Subject position in source");
        positionPanel.orientation = "column";
        var positionButtons = [];
        var selectedPositionIndex = 7;
        var rowIndex;
        var columnIndex;
        for (rowIndex = 0; rowIndex < 3; rowIndex += 1) {
            var row = positionPanel.add("group");
            for (columnIndex = 0; columnIndex < 3; columnIndex += 1) {
                var positionIndex = rowIndex * 3 + columnIndex;
                var positionButton = row.add("button", undefined, ".");
                positionButton.preferredSize = [38, 28];
                positionButton.helpTip = positions[positionIndex].label;
                positionButton.positionIndex = positionIndex;
                positionButton.onClick = function () {
                    var item;
                    selectedPositionIndex = this.positionIndex;
                    for (item = 0; item < positionButtons.length; item += 1) {
                        positionButtons[item].text = item === selectedPositionIndex ? "O" : ".";
                    }
                };
                positionButtons.push(positionButton);
            }
        }
        positionButtons[7].text = "O";
        var duplicateBox = dialog.add("checkbox", undefined, "Work on a duplicate"); duplicateBox.value = true;
        var actionBox = dialog.add("checkbox", undefined, "Run Generative Expand automatically"); actionBox.value = true;
        var autoExportBox = dialog.add("checkbox", undefined, "Export selected ratios automatically"); autoExportBox.value = false;
        var ratioPanel = dialog.add("panel", undefined, "Export ratios"); ratioPanel.orientation = "column";
        var ratioCheckboxes = [];
        for (rowIndex = 0; rowIndex < 2; rowIndex += 1) {
            var ratioRow = ratioPanel.add("group");
            for (columnIndex = 0; columnIndex < 4; columnIndex += 1) {
                var ratioIndex = rowIndex * 4 + columnIndex;
                var ratioBox = ratioRow.add("checkbox", undefined, ratios[ratioIndex].label);
                ratioBox.value = true;
                ratioCheckboxes.push(ratioBox);
            }
        }
        var status = dialog.add("statictext", undefined, "Run creates a square master at " + EXPAND_FACTOR + "x the longest source side.", { multiline: true });
        status.preferredSize.width = 360;
        var buttons = dialog.add("group"); buttons.alignment = "right";
        var runButton = buttons.add("button", undefined, "Run");
        var exportButton = buttons.add("button", undefined, "Batch Export");
        var closeButton = buttons.add("button", undefined, "Close", { name: "cancel" });
        var preparedDoc = app.documents.length ? app.activeDocument : null;
        var preparedInfo = preparedDoc ? readPreparedMetadata(preparedDoc) : null;
        if (preparedInfo) status.text = "Prepared master detected. Batch Export is available.";

        runButton.onClick = function () {
            try {
                var source = activeSavedImage();
                var prepared = prepareDocument(source, positions[selectedPositionIndex], duplicateBox.value, actionBox.value);
                preparedDoc = prepared.doc;
                preparedInfo = prepared.info;
                runButton.enabled = false;
                if (actionBox.value && autoExportBox.value) {
                    status.text = exportPrepared(preparedDoc, preparedInfo, selectedRatios(ratioCheckboxes));
                } else {
                    status.text = actionBox.value ? "Square master generated. Choose the preferred variation, then use Batch Export." : "Square master prepared without generation. Batch Export is ready.";
                }
            } catch (error) {
                alert("Subject-Centered Expand\n\n" + error.message);
            }
        };
        exportButton.onClick = function () {
            try {
                if (!preparedDoc || !readPreparedMetadata(preparedDoc)) {
                    preparedDoc = app.documents.length ? app.activeDocument : null;
                    preparedInfo = preparedDoc ? readPreparedMetadata(preparedDoc) : null;
                    if (preparedDoc && !preparedInfo) {
                        throw new Error("The active document is not a v2 prepared master. Run the script on the saved source image first.");
                    }
                }
                status.text = exportPrepared(preparedDoc, preparedInfo, selectedRatios(ratioCheckboxes));
            } catch (error) {
                alert("Subject-Centered Expand\n\n" + error.message);
            }
        };
        closeButton.onClick = function () { dialog.close(); };
        dialog.center();
        dialog.show();
    } finally {
        app.preferences.rulerUnits = oldUnits;
    }
}());
