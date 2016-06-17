# homework-zwave
Z-Wave module for Homework

You need to have OpenZWave installed on your system as a shared library to be able to use this.

## example config
```javascript
{
    "zwave": {
        "port": "/dev/ttyAMA0",
        "types": {
            "zwave:20": "fan",
            "zwave:14": "light"
        }
    }
}
```
