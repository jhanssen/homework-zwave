/*global module*/

"use strict";

const data = {
    homework: undefined,
    zwave: undefined
};

function Generic(nodeid, nodeinfo)
{
    this._initValues(this);
    this.nodeid = nodeid;
    this.type = nodeinfo.type;
}

Generic.dcnt = 0;
Generic.vcnt = 0;

Generic.ClassIds = {
    49: "Temperature", // read only
    67: "Setpoint",
    64: "Mode",
    66: "Operating State", // read only
    69: "Fan State", // read only
    68: "Fan Mode"
};

Generic.acceptable = function(val)
{
    return val.genre == "user" && !val.write_only;
};

Generic.createValue = function(v, type)
{
    var name = v.label;
    if (!(typeof name === "string") || !name.length) {
        if (v.class_id in Generic.ClassIds)
            name = Generic.ClassIds[v.class_id];
        else
            name = "Unknown:" + v.class_id + " " + (++Generic.vcnt);
    }
    var values, range;
    if (v.type == "list") {
        values = Object.create(null);
        for (var val in v.values) {
            values[v.values[val]] = v.values[val];
        }
        if (v.max > v.min)
            range = [v.min, v.max];
    }
    if (type == "RGBWLed" && name == "Color") {
        data.zwave.setChangeVerified(v.node_id, v.class_id, v.instance, v.index, true);
    }
    const hwv = new data.homework.Device.Value(name, { values: values, range: range, handle: v, units: (v.units !== "" ? v.units : undefined), readOnly: v.read_only });
    if (!v.read_only) {
        hwv._valueUpdated = function(val) {
            try {
                if (v.type == "decimal" || v.type == "byte") {
                    val = parseInt(val);
                } else if (v.type == "bool") {
                    switch (typeof val) {
                    case "string":
                        val = (val == "true") ? true : false;
                        break;
                    case "number":
                        val = val ? true : false;
                        break;
                    default:
                        break;
                    }
                }
                data.zwave.setValue(v.node_id, v.class_id, v.instance, v.index, val);
            } catch (e) {
                data.homework.Console.error("error updating value", e);
            }
        };
    }
    hwv._valueType = (function() {
        if (this.values instanceof Array && this.values.length > 0)
            return "array";
        switch (this.handle.type) {
        case "list":
            return "array";
        case "string":
            return "string";
        case "bool":
            return "boolean";
        default:
            break;
        }
        return "number";
    }).bind(hwv);
    return hwv;
};

Generic.prototype = {
    _typeOverride: undefined,
    _standardsOverride: undefined,

    _acceptValue: function(value) {
        if (Generic.acceptable(value))
            return true;
        return false;
    },
    _changeValue: function(value) {
        // find the homework value
        if (value.value_id in this._hwvalues) {
            var hwval = this._hwvalues[value.value_id];
            if (value.units !== "")
                hwval.units = value.units;
            hwval.update(value.value);
        }
    },
    _removeValue: function(value) {
    },
    createHomeworkDevice: function(type, uuid, devices) {
        var devopts = { uuid: uuid };
        if (this._standardsOverride)
            devopts.standards = this._standardsOverride;
        var hwdev = new data.homework.Device(this._typeOverride || type, devopts);
        if (!hwdev.name) {
            var n = this.type;
            if (!(typeof n === "string") || !n.length)
                n = "Generic";
            hwdev.name = n + " " + (++Generic.dcnt);
        }
        for (var k in this._values) {
            let v = this._values[k];
            let hwval = Generic.createValue(v, hwdev.type);
            hwval.update(v.value);
            this._hwvalues[k] = hwval;
            hwdev.addValue(hwval, true);
        }

        devices.fixupValues(hwdev);

        this._hwdevice = hwdev;
        data.homework.addDevice(hwdev);
    },
    updateHomeworkDevice: function(devices) {
        // create outstanding values
        for (var k in this._values) {
            if (k in this._hwvalues)
                continue;
            let v = this._values[k];
            let hwval = Generic.createValue(v, this._hwdevice.type);
            hwval.update(v.value);
            this._hwvalues[k] = hwval;
            this._hwdevice.addValue(hwval, true);
        }

        devices.fixupValues(this._hwdevice);
    }
};

function findValue(dev, name)
{
    if (name in dev.values)
        return dev.values[name];
    return undefined;
}

function thermostatOverride()
{
    return {
        mode: {
            meta: () => {
                return {
                    values: {
                        cool: "cool",
                        heat: "heat",
                        off: "off"
                    },
                    readOnly: false
                };
            },
            get: (dev) => {
                var val;
                if ((val = findValue(dev, "Mode"))) {
                    switch (val.value) {
                    case "Cool":
                        return "cool";
                    case "Heat":
                        return "heat";
                    case "Off":
                        return "off";
                    }
                    throw new Error(`Unhandled thermostat get Mode value ${val.value}`);
                }
                throw new Error(`Thermostat get Mode not found`);
            },
            set: (dev, value) => {
                // set Mode to "Cool", "Heat" or "Off"
                var val;
                if ((val = findValue(dev, "Mode"))) {
                    switch (value) {
                    case "cool":
                        val.value = "Cool";
                        return;
                    case "heat":
                        val.value = "Heat";
                        return;
                    case "off":
                        val.value = "Off";
                        return;
                    }
                    throw new Error(`Unhandled thermostat set Mode value ${value}`);
                }
                throw new Error(`Thermostat set Mode not found`);
            }
        },
        fan: {
            meta: () => {
                return {
                    values: {
                        auto: "auto",
                        off: "off"
                    },
                    readOnly: false
                };
            },
            get: (dev) => {
                // set Fan Mode to "Auto Low" or "On Low"
                var val;
                if ((val = findValue(dev, "Fan Mode"))) {
                    switch (val.value) {
                    case "Auto Low":
                        return "auto";
                    case "On Low":
                        return "on";
                    }
                    throw new Error(`Unhandled thermostat get Fan Mode value ${val.value}`);
                }
                throw new Error(`Thermostat get Fan Mode not found`);
            },
            set: (dev, value) => {
                var val;
                if ((val = findValue(dev, "Fan Mode"))) {
                    switch (value) {
                    case "auto":
                        val.value = "Auto Low";
                        return;
                    case "on":
                        val.value = "On Low";
                        return;
                    }
                    throw new Error(`Unhandled thermostat set Fan Mode value ${value}`);
                }
                throw new Error(`Thermostat set Fan Mode not found`);
            }
        },
        setpoint: {
            meta: () => {
                return { readOnly: false };
            },
            get: (dev) => {
                var val, mval, valname = "Cooling 1";
                if ((mval = findValue(dev, "Mode"))) {
                    if (mval.value == "Heat")
                        valname = "Heating 1";
                }

                if ((val = findValue(dev, valname))) {
                    return {
                        units: val.units,
                        value: val.value
                    };
                }
                throw new Error(`Thermostat get ${valname} not found`);
            },
            set: (dev, value) => {
                var val, mval, valname = "Cooling 1";
                if ((mval = findValue(dev, "Mode"))) {
                    if (mval.value == "Heat")
                        valname = "Heating 1";
                }

                if ((val = findValue(dev, valname))) {
                    val.value = value;
                    return;
                }
                throw new Error(`Thermostat set ${valname} not found`);
            }
        },
        temperature: {
            meta: () => {
                return { readOnly: true };
            },
            get: (dev) => {
                // Temperature
                var val;
                if ((val = findValue(dev, "Temperature"))) {
                    return {
                        units: val.units,
                        value: val.value
                    };
                }
                throw new Error(`Thermostat get Temperature not found`);
            }
        }
    };
}

module.exports = {
    init: function(devices) {
        data.homework = devices.homework;
        data.zwave = devices.zwave;

        var ctor = function(nodeid, nodeinfo) {
            var d = new Generic(nodeid, nodeinfo);
            if (nodeinfo.manufacturerid == "0x010f" && nodeinfo.producttype == "0x0900" && nodeinfo.productid == "0x2000") {
                d._typeOverride = "RGBWLed";
                d._standardsOverride = {
                    Color: {
                        meta: () => {
                            return {
                                units: "#RRGGBBWW"
                            };
                        }
                    }
                };
            } else if (nodeinfo.type == "Secure Keypad Door Lock") {
                d._typeOverride = "Lock";
                d._standardsOverride = {
                    Locked: {
                        meta: () => { return {}; }
                    }
                };
            } else if (/^General Thermostat/.test(nodeinfo.type)) {
                d._typeOverride = "Thermostat";
                d._standardsOverride = thermostatOverride();
            }
            return d;
        };
        devices.registerDevice(ctor, Generic.prototype);
    }
};
