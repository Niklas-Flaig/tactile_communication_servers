export type PluginToServer =
    | { type: 'get-connected-components' }


export type ServerToPlugin =
    | { type: 'server-ping' }
    | { type: 'connected-components'; components: HardwareComponent[] }


export type ServerToDriver =
    | { type: 'get-connected-components' }

export type DriverToServer =
    | { type: 'connected-components'; components: HardwareComponent[] }
