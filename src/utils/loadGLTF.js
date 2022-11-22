import * as THREE from 'three';
import {
    GLTFLoader
} from 'three/examples/jsm/loaders/GLTFLoader';
import {
    KTX2Loader
} from 'three/examples/jsm/loaders/KTX2Loader';
import {
    DRACOLoader
} from 'three/examples/jsm/loaders/DRACOLoader';
import {
    MeshoptDecoder
} from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const loader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('/draco/');
loader.setDRACOLoader(dracoLoader);

const ktx2Loader = new KTX2Loader();
ktx2Loader.setTranscoderPath('/basis/');
loader.setKTX2Loader(ktx2Loader);

loader.setMeshoptDecoder(MeshoptDecoder);

const loadGLTF = (
    url, {
        renderer
    } = {} // ktx2Loader.detectSupport(renderer);
) => {
    ktx2Loader.detectSupport(renderer);

    return new Promise((resolve, reject) => {
        loader.load(
            url,
            (gltf) => {
                resolve(gltf);
            },
            () => {},
            (err) => {
                console.warn(`Could not load texture at ${url}`);
                reject(err);
            }
        );
    });
};

export default loadGLTF;