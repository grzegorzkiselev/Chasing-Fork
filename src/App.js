import * as THREE from "three"
import * as YUKA from 'yuka'
import { WiggleBone } from './utils/WiggleBones.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EntityManager } from "yuka"

const sizes = {
  width: window.innerWidth,
  height: window.innerHeight
}
const mouse = new THREE.Vector2()
window.addEventListener('mousemove', (event) =>
{
    mouse.x = event.clientX / sizes.width * 2 - 1
    mouse.y = - (event.clientY / sizes.height) * 2 + 1
})

const canvas = document.querySelector('canvas')
const scene = new THREE.Scene()

const updateAllMaterials = (child, material) => {
    child.traverse((child) => {
        if (child.isMesh) {
            child.material = material
            child.castShadow = true
        }
    })
}

const textureLoader = new THREE.TextureLoader()
const cubeTexureLoader = new THREE.CubeTextureLoader()

const environmentMap = cubeTexureLoader.load([
  "./textures/environmentMaps/cubeMap/px.jpg",
  "./textures/environmentMaps/cubeMap/nx.jpg",
  "./textures/environmentMaps/cubeMap/py.jpg",
  "./textures/environmentMaps/cubeMap/ny.jpg",
  "./textures/environmentMaps/cubeMap/pz.jpg",
  "./textures/environmentMaps/cubeMap/nz.jpg"
])
// const background = cubeTexureLoader.load([
//   "./textures/environmentMaps/sceneBg/px.jpg",
//   "./textures/environmentMaps/sceneBg/nx.jpg",
//   "./textures/environmentMaps/sceneBg/py.jpg",
//   "./textures/environmentMaps/sceneBg/ny.jpg",
//   "./textures/environmentMaps/sceneBg/pz.jpg",
//   "./textures/environmentMaps/sceneBg/nz.jpg"
// ])

// scene.background = background

const sceneBackgroundMaterial = new THREE.ShaderMaterial({
    uniforms: {
        turbidity: {
            value: 2.5,
        },
        rayleigh: {
            value: 2.7,
        },
        mieCoefficient: {
            value: 0.218,
        },
        mieDirectionalG: {
            value: 0.23,
        },
        sunPosition: {
            value: new THREE.Vector3()
        },
        up: {
            value: new THREE.Vector3(0, 1, 0)
        },
    },
    name: 'SkyShader',
    fragmentShader: `
    #include <common>

		varying vec3 vWorldPosition;
		varying vec3 vSunDirection;
		varying float vSunfade;
		varying vec3 vBetaR;
		varying vec3 vBetaM;
		varying float vSunE;

    vec3 dithering( vec3 color ) {
  		float grid_position = rand( gl_FragCoord.xy );
  		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
  		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
  		return color + dither_shift_RGB;
  	}

		uniform float mieDirectionalG;
		uniform vec3 up;

		const vec3 cameraPos = vec3( 0.0, 0.0, 0.0 );

		// constants for atmospheric scattering
		const float pi = 3.141592653589793238462643383279502884197169;

		const float n = 1.0003; // refractive index of air
		const float N = 2.545E25; // number of molecules per unit volume for air at 288.15K and 1013mb (sea level -45 celsius)

		// optical length at zenith for molecules
		const float rayleighZenithLength = 8.4E3;
		const float mieZenithLength = 1.25E3;
		// 66 arc seconds -> degrees, and the cosine of that
		const float sunAngularDiameterCos = 0.999956676946448443553574619906976478926848692873900859324;

		// 3.0 / ( 16.0 * pi )
		const float THREE_OVER_SIXTEENPI = 0.05968310365946075;
		// 1.0 / ( 4.0 * pi )
		const float ONE_OVER_FOURPI = 0.07957747154594767;

		float rayleighPhase( float cosTheta ) {
			return THREE_OVER_SIXTEENPI * ( 1.0 + pow( cosTheta, 2.0 ) );
		}

		float hgPhase( float cosTheta, float g ) {
			float g2 = pow( g, 2.0 );
			float inverse = 1.0 / pow( 1.0 - 2.0 * g * cosTheta + g2, 1.5 );
			return ONE_OVER_FOURPI * ( ( 1.0 - g2 ) * inverse );
		}

		void main() {

			vec3 direction = normalize( vWorldPosition - cameraPos );

			// optical length
			// cutoff angle at 90 to avoid singularity in next formula.
			float zenithAngle = acos( max( 0.0, dot( up, direction ) ) );
			float inverse = 1.0 / ( cos( zenithAngle ) + 0.15 * pow( 93.885 - ( ( zenithAngle * 180.0 ) / pi ), -1.253 ) );
			float sR = rayleighZenithLength * inverse;
			float sM = mieZenithLength * inverse;

			// combined extinction factor
			vec3 Fex = exp( -( vBetaR * sR + vBetaM * sM ) );

			// in scattering
			float cosTheta = dot( direction, vSunDirection );

			float rPhase = rayleighPhase( cosTheta * 0.5 + 0.5 );
			vec3 betaRTheta = vBetaR * rPhase;

			float mPhase = hgPhase( cosTheta, mieDirectionalG );
			vec3 betaMTheta = vBetaM * mPhase;

			vec3 Lin = pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * ( 1.0 - Fex ), vec3( 1.5 ) );
			Lin *= mix( vec3( 1.0 ), pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * Fex, vec3( 1.0 / 2.0 ) ), clamp( pow( 1.0 - dot( up, vSunDirection ), 5.0 ), 0.0, 1.0 ) );

			// nightsky
			float theta = acos( direction.y ); // elevation --> y-axis, [-pi/2, pi/2]
			float phi = atan( direction.z, direction.x ); // azimuth --> x-axis [-pi/2, pi/2]
			vec2 uv = vec2( phi, theta ) / vec2( 2.0 * pi, pi ) + vec2( 0.5, 0.0 );
			vec3 L0 = vec3( 0.1 ) * Fex;

			// composition + solar disc
			float sundisk = smoothstep( sunAngularDiameterCos, sunAngularDiameterCos + 0.00002, cosTheta );
			L0 += ( vSunE * 19000.0 * Fex ) * sundisk;

			vec3 texColor = ( Lin + L0 ) * 0.04 + vec3( 0.0, 0.0003, 0.00075 );

			vec3 retColor = pow( texColor, vec3( 1.0 / ( 1.2 + ( 1.2 * vSunfade ) ) ) );

			gl_FragColor = vec4( retColor, 1.0 );

      gl_FragColor.rgb += 0.05;
      vec3 desaurated =  gl_FragColor.rgb / 0.21 * gl_FragColor.r + 0.71 * gl_FragColor.g + 0.07 * gl_FragColor.b;
      desaurated -= 0.023;
      gl_FragColor.rgb = mix(gl_FragColor.rgb, desaurated, 0.95);
      gl_FragColor.rgb = dithering(gl_FragColor.rgb);


			#include <tonemapping_fragment>
			#include <encodings_fragment>

		}`,
    vertexShader: `
		uniform vec3 sunPosition;
		uniform float rayleigh;
		uniform float turbidity;
		uniform float mieCoefficient;
		uniform vec3 up;

		varying vec3 vWorldPosition;
		varying vec3 vSunDirection;
		varying float vSunfade;
		varying vec3 vBetaR;
		varying vec3 vBetaM;
		varying float vSunE;

		// constants for atmospheric scattering
		const float e = 2.71828182845904523536028747135266249775724709369995957;
		const float pi = 3.141592653589793238462643383279502884197169;

		// wavelength of used primaries, according to preetham
		const vec3 lambda = vec3( 680E-9, 550E-9, 450E-9 );
		// this pre-calcuation replaces older TotalRayleigh(vec3 lambda) function:
		// (8.0 * pow(pi, 3.0) * pow(pow(n, 2.0) - 1.0, 2.0) * (6.0 + 3.0 * pn)) / (3.0 * N * pow(lambda, vec3(4.0)) * (6.0 - 7.0 * pn))
		const vec3 totalRayleigh = vec3( 5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5 );

		// mie stuff
		// K coefficient for the primaries
		const float v = 4.0;
		const vec3 K = vec3( 0.686, 0.678, 0.666 );
		// MieConst = pi * pow( ( 2.0 * pi ) / lambda, vec3( v - 2.0 ) ) * K
		const vec3 MieConst = vec3( 1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14 );

		// earth shadow hack
		// cutoffAngle = pi / 1.95;
		const float cutoffAngle = 1.6110731556870734;
		const float steepness = 1.5;
		const float EE = 1000.0;

		float sunIntensity( float zenithAngleCos ) {
			zenithAngleCos = clamp( zenithAngleCos, -1.0, 1.0 );
			return EE * max( 0.0, 1.0 - pow( e, -( ( cutoffAngle - acos( zenithAngleCos ) ) / steepness ) ) );
		}

		vec3 totalMie( float T ) {
			float c = ( 0.2 * T ) * 10E-18;
			return 0.434 * c * MieConst;
		}

		void main() {

			vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
      worldPosition.y *= -1.0;
			vWorldPosition = worldPosition.xyz;

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			gl_Position.z = gl_Position.w; // set z to camera.far

			vSunDirection = normalize( sunPosition );

			vSunE = sunIntensity( dot( vSunDirection, up ) );

			vSunfade = 1.0 - clamp( 1.0 - exp( ( sunPosition.y / 450000.0 ) ), 0.0, 1.0 );

			float rayleighCoefficient = rayleigh - ( 1.0 * ( 1.0 - vSunfade ) );

			// extinction (absorbtion + out scattering)
			// rayleigh coefficients
			vBetaR = totalRayleigh * rayleighCoefficient;

			// mie coefficients
			vBetaM = totalMie( turbidity ) * mieCoefficient;

		}`,
    side: THREE.BackSide,
    depthWrite: false,
})

const sceneBackgroundGeometry = new THREE.BoxGeometry(20, 20, 20)

const sceneBackgound = new THREE.Mesh(sceneBackgroundGeometry, sceneBackgroundMaterial)
sceneBackgound.scale.setScalar(100);
scene.add(sceneBackgound)

const options = {
  enableSwoopingCamera: false,
  enableRotation: true,
  transmission: 1,
  thickness: 1.2,
  roughness: 0.05,
  envMapIntensity: 1.5,
  clearcoat: 1,
  clearcoatRoughness: 0.1,
  normalScale: 1,
  clearcoatNormalScale: 0.3,
  normalRepeat: 1,
  bloomThreshold: 0.85,
  bloomStrength: 0.5,
  bloomRadius: 0.33
}

const normalMapTexture = textureLoader.load("./textures/environmentMaps/normal.jpeg")
normalMapTexture.wrapS = THREE.RepeatWrapping
normalMapTexture.wrapT = THREE.RepeatWrapping
normalMapTexture.repeat.set(options.normalRepeat, options.normalRepeat)

const material = new THREE.MeshPhysicalMaterial({
  transmission: options.transmission,
  thickness: options.thickness,
  roughness: options.roughness,
  // envMap: hdrEquirect,
  envMap: environmentMap,
  envMapIntensity: options.envMapIntensity,
  clearcoat: options.clearcoat,
  clearcoatRoughness: options.clearcoatRoughness,
  normalScale: new THREE.Vector2(options.normalScale),
  normalMap: normalMapTexture,
  clearcoatNormalMap: normalMapTexture,
  clearcoatNormalScale: new THREE.Vector2(options.clearcoatNormalScale)
})

const gltfLoader = new GLTFLoader()

const entityManager = new YUKA.EntityManager();

function sync(entity, renderComponent) {
    renderComponent.matrix.copy(entity.worldMatrix);
}

// const floorGeometry = new THREE.PlaneBufferGeometry(20, 20)
// const floorMaterial = new THREE.MeshStandardMaterial()
// material.roughness = 0.7
// const floor = new THREE.Mesh(floorGeometry, floorMaterial)
// floor.rotation.x = - Math.PI * 0.5
// floor.position.y = 0
// floor.receiveShadow = true
// floor.castShadow = true
// scene.add(floor)

const helperGeometry = new THREE.ConeGeometry(0.6, 1, 3);
helperGeometry.translate(0, 0.51, 0)
const helperMaterial = new THREE.MeshNormalMaterial()
const helper = new THREE.Mesh(helperGeometry, helperMaterial)
helper.castShadow = true
helper.receiveShadow = true
helper.position.set(3, -1, 3)
scene.add( helper );

const target = new YUKA.Vehicle()
target.setRenderComponent(helper, sync)
target.position.set(3, 0, 3)
target.maxSpeed = 2
entityManager.add(target)

let mascot, mascotSteerer, rootBone, wiggleBones
let mascotLoaded = false

// gltfLoader.load('./models/index.gltf', (gltf) => {
gltfLoader.load('./models/fork.glb', (gltf) => {
    const mesh = gltf.scene.children[0]
    mesh.position.set(0, 3, 0);
    // mascot = scene.getObjectByName("MascotSkinned")
    scene.add(mesh)
    console.log(mesh)

    mascot = scene.getObjectByName("Fork")

    updateAllMaterials(mascot, material)

    rootBone = mascot.children.find((c) => c.isBone);

    mascotSteerer = new YUKA.Vehicle();
    mascotSteerer.setRenderComponent(rootBone, sync);
    mascotSteerer.maxSpeed = 3
    
    entityManager.add(mascotSteerer)
    
    const seekBehavior = new YUKA.SeekBehavior(target.position)
    const pursuitBehavior = new YUKA.PursuitBehavior(target, 1);
    mascotSteerer.steering.add(pursuitBehavior)
    
    wiggleBones = [];
    rootBone.traverse((obj) => {
        if (obj.name === 'Root') return;
        if ((obj.isBone && obj.name.match('Leg')) || obj.name.match('Head')) {
            const options = obj.name.match('Head') ?
                {
                    bounceFactor: 10,
                    maxStretch: 1
                } :
                {
                    bounceFactor: 10,
                    maxStretch: 1
                };
            wiggleBones.push(
                new WiggleBone(obj, { ...options, scene: scene})
            );
        }
    });

    mascotLoaded = true
}
)

const ambientLight = new THREE.AmbientLight(0x606575, 0.4);

const light = new THREE.DirectionalLight(0xffffff, 0.2);
light.position.set(0, 100, 0)
light.castShadow = true
light.receiveShadow = true
light.shadow.mapSize.width = 2048
light.shadow.mapSize.height = 2048
light.shadow.camera.top = 10
light.shadow.camera.left = -10
light.shadow.camera.right = 10
light.shadow.camera.bottom = -10
light.shadow.camera.near = 0.5
light.shadow.camera.far = 102

const lightHelper = new THREE.DirectionalLightHelper(light)
const lightShadowsHelper = new THREE.CameraHelper(light.shadow.camera)
lightShadowsHelper.visible = true

scene.add(ambientLight, light)

const floorGeometry = new THREE.PlaneGeometry( 20, 20, 32, 32 );
const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x292b33,
    side: THREE.DoubleSide
})
const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.position.set(0, -1, 0)
floor.rotation.x = -Math.PI * 0.5
floor.receiveShadow = true;
scene.add(floor);

const camera = new THREE.PerspectiveCamera(20, sizes.width / sizes.height, 0.1, 100)
camera.position.set(18, 36, 18)
camera.rotation.x = Math.PI / 4
scene.add(camera)

// Controls
const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true
controls.maxPolarAngle = Math.PI / 2
controls.enableZoom = false

const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialiased: false,
    logarithmicDepthBuffer: true,
})
renderer.setClearColor(0x000000, 1);
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.physicallyCorrectLights = true
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.setSize(sizes.width, sizes.height)
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.shadowMap.enabled = true

const raycaster = new THREE.Raycaster()

window.addEventListener('resize', () =>
{
    sizes.width = window.innerWidth
    sizes.height = window.innerHeight

    camera.aspect = sizes.width / sizes.height
    camera.updateProjectionMatrix()

    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

const clock = new THREE.Clock()
let oldElapsedTime = 0

const tick = () => {
    const elapsedTime = clock.getElapsedTime()
    const deltaTime = elapsedTime - oldElapsedTime
    oldElapsedTime = elapsedTime

    let floorIntersect = raycaster.intersectObject(floor)

    raycaster.setFromCamera(mouse, camera)

    entityManager.update(deltaTime)

    if (mascotLoaded) {
        if (floorIntersect.length > 0) {
            target.position.copy(floorIntersect[0].point);
            helper.position.copy(target.position)
        }
        rootBone.position.copy(mascotSteerer.position)
        rootBone.rotation.y += 0.01
        entityManager.update(deltaTime)
        wiggleBones.forEach((wiggle, i) => {
            wiggle.update(deltaTime);
        });
    }
    
    controls.update()
    
    renderer.render(scene, camera)

    window.requestAnimationFrame(tick);
}

tick()

// await loadGLTF('./gltf/mascot/index.gltf', {
//     renderer: this.$renderer,
// });
// this.mesh = scene.getObjectByName('Mascot');
// this.mesh.castShadow = true;
// // this.mesh.scale.setScalar(0.25);
// // this.mesh.position.set(0, 1.2, 0);

// this.rootBone = scene
//     .getObjectByName('MascotSkinned')
//     .children.find((c) => c.isBone);

// this.rootBone.scale.setScalar(0.27);
// this.rootBone.position.set(0, 0.6, 0);

// this.wiggleBones = [];
// this.rootBone.traverse((obj) => {
//     if (obj.name === 'Root') return;
//     if ((obj.isBone && obj.name.match('Leg')) || obj.name.match('Head')) {
//         const options = obj.name.match('Head') ?
//             {
//                 bounceFactor: 0.035,
//                 maxStretch: 1
//             } :
//             {
//                 bounceFactor: 0.025,
//                 maxStretch: 0.9
//             };

//         this.wiggleBones.push(
//             new WiggleBone(obj, { ...options,
//                 scene: this.$worldScene
//             })
//         );
//     }
// });