export function attachGoogleMap(){throw Error('Esta edición utiliza mapas gratuitos.');}
export function assertMapExportAllowed(map){if(map?.__googleMap)throw Error('Solo mapas gratuitos en esta edición.');}
