import { useCallback, useEffect, useRef, useState } from "react";

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
}

function useAnimationFrame(callback: (deltaTime: number) => void) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    let requestId = 0;
    let previousTime: number | undefined;

    const tick = (time: number) => {
      if (previousTime !== undefined) {
        callbackRef.current(time - previousTime);
      }
      previousTime = time;
      requestId = requestAnimationFrame(tick);
    };

    requestId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(requestId);
  }, []);
}

function useMousePosition() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return mousePosition;
}

const vertexShaderSource = `
  attribute vec4 a_position;
  attribute vec3 a_normal;

  uniform mat4 u_matrix;
  uniform mat4 u_normalMatrix;

  varying vec3 v_normal;
  varying vec3 v_position;

  void main() {
    gl_Position = u_matrix * a_position;
    v_normal = mat3(u_normalMatrix) * a_normal;
    v_position = (u_matrix * a_position).xyz;
  }
`;

const fragmentShaderSource = `
  precision mediump float;

  varying vec3 v_normal;
  varying vec3 v_position;

  uniform vec3 u_lightDirection;
  uniform vec3 u_color;
  uniform float u_time;

  void main() {
    vec3 normal = normalize(v_normal);
    vec3 lightDir = normalize(u_lightDirection);

    float light = clamp(dot(normal, lightDir), 0.0, 1.0);

    vec3 ambient = u_color * 0.3;
    vec3 diffuse = u_color * light * 0.7;

    float sin1 = sin(u_time * 0.6 + v_position.x * 0.5);
    float sin2 = sin(u_time * 1.2 + v_position.y * 0.5);
    float sin3 = sin(u_time * 0.3 + v_normal.x * 0.5);
    vec3 sinus = vec3(sin1, sin2, sin3) * 0.08;

    vec3 color = ambient + diffuse + sinus;

    gl_FragColor = vec4(color, 1.0);
  }
`;

type Mat4 = Float32Array;

const mat4 = {
  create: (): Mat4 => new Float32Array(16),

  identity: (out: Mat4): Mat4 => {
    out.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    return out;
  },

  perspective: (out: Mat4, fovy: number, aspect: number, near: number, far: number): Mat4 => {
    const f = 1.0 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);

    out[0] = f / aspect;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = f;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[12] = 0;
    out[13] = 0;
    out[14] = 2 * far * near * nf;
    out[15] = 0;
    return out;
  },

  multiply: (out: Mat4, a: Mat4, b: Mat4): Mat4 => {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
    out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
    out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
    out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
    out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    return out;
  },

  rotateY: (out: Mat4, a: Mat4, rad: number): Mat4 => {
    const s = Math.sin(rad);
    const c = Math.cos(rad);
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];

    out[0] = a00 * c - a20 * s;
    out[1] = a01 * c - a21 * s;
    out[2] = a02 * c - a22 * s;
    out[3] = a03 * c - a23 * s;
    out[8] = a00 * s + a20 * c;
    out[9] = a01 * s + a21 * c;
    out[10] = a02 * s + a22 * c;
    out[11] = a03 * s + a23 * c;

    if (a !== out) {
      out[4] = a[4]; out[5] = a[5]; out[6] = a[6]; out[7] = a[7];
      out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
    }
    return out;
  },

  translate: (out: Mat4, a: Mat4, v: [number, number, number]): Mat4 => {
    const [x, y, z] = v;
    out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
    out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
    out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
    out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];

    if (a !== out) {
      out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; out[3] = a[3];
      out[4] = a[4]; out[5] = a[5]; out[6] = a[6]; out[7] = a[7];
      out[8] = a[8]; out[9] = a[9]; out[10] = a[10]; out[11] = a[11];
    }
    return out;
  },
};

function createCubeGeometry() {
  const positions = new Float32Array([
    -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1,
    -1, -1, -1, -1, 1, -1, 1, 1, -1, 1, -1, -1,
    -1, 1, -1, -1, 1, 1, 1, 1, 1, 1, 1, -1,
    -1, -1, -1, 1, -1, -1, 1, -1, 1, -1, -1, 1,
    1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1,
    -1, -1, -1, -1, -1, 1, -1, 1, 1, -1, 1, -1,
  ]);

  const normals = new Float32Array([
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
    0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
    1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
    -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
  ]);

  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3,
    4, 5, 6, 4, 6, 7,
    8, 9, 10, 8, 10, 11,
    12, 13, 14, 12, 14, 15,
    16, 17, 18, 16, 18, 19,
    20, 21, 22, 20, 22, 23,
  ]);

  return { positions, normals, indices };
}

function createShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader compilation error:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

interface GLResources {
  program: WebGLProgram;
  positionBuffer: WebGLBuffer;
  normalBuffer: WebGLBuffer;
  indexBuffer: WebGLBuffer;
  positionLocation: number;
  normalLocation: number;
  matrixLocation: WebGLUniformLocation | null;
  normalMatrixLocation: WebGLUniformLocation | null;
  lightDirectionLocation: WebGLUniformLocation | null;
  colorLocation: WebGLUniformLocation | null;
  timeLocation: WebGLUniformLocation | null;
  indexCount: number;
}

export const ParticleHero = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const resourcesRef = useRef<GLResources | null>(null);
  const rotationRef = useRef(0);
  const elapsedRef = useRef(0);
  const [particles, setParticles] = useState<Particle[]>([]);
  const mousePosition = useMousePosition();

  useEffect(() => {
    setParticles(
      Array.from({ length: 50 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        size: Math.random() * 3 + 5,
        opacity: Math.random() * 0.3 + 0.7,
      }))
    );
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl");
    if (!gl) return;

    glRef.current = gl;

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    if (!vertexShader || !fragmentShader) return;

    const program = gl.createProgram();
    if (!program) return;

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Program linking error:", gl.getProgramInfoLog(program));
      return;
    }

    const geometry = createCubeGeometry();

    const positionBuffer = gl.createBuffer();
    const normalBuffer = gl.createBuffer();
    const indexBuffer = gl.createBuffer();
    if (!positionBuffer || !normalBuffer || !indexBuffer) return;

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, geometry.positions, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, geometry.normals, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.indices, gl.STATIC_DRAW);

    resourcesRef.current = {
      program,
      positionBuffer,
      normalBuffer,
      indexBuffer,
      positionLocation: gl.getAttribLocation(program, "a_position"),
      normalLocation: gl.getAttribLocation(program, "a_normal"),
      matrixLocation: gl.getUniformLocation(program, "u_matrix"),
      normalMatrixLocation: gl.getUniformLocation(program, "u_normalMatrix"),
      lightDirectionLocation: gl.getUniformLocation(program, "u_lightDirection"),
      colorLocation: gl.getUniformLocation(program, "u_color"),
      timeLocation: gl.getUniformLocation(program, "u_time"),
      indexCount: geometry.indices.length,
    };

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    return () => {
      gl.deleteProgram(program);
      gl.deleteBuffer(positionBuffer);
      gl.deleteBuffer(normalBuffer);
      gl.deleteBuffer(indexBuffer);
      resourcesRef.current = null;
    };
  }, []);

  useAnimationFrame(
    useCallback(
      (deltaTime: number) => {
        rotationRef.current += deltaTime * 0.001;
        elapsedRef.current += deltaTime * 0.001;

        setParticles((prev) =>
          prev.map((particle) => {
            let newX = particle.x + particle.vx;
            let newY = particle.y + particle.vy;
            let newVx = particle.vx;
            let newVy = particle.vy;

            if (newX < 0 || newX > 100) {
              newVx = -newVx;
              newX = Math.max(0, Math.min(100, newX));
            }
            if (newY < 0 || newY > 100) {
              newVy = -newVy;
              newY = Math.max(0, Math.min(100, newY));
            }

            return { ...particle, x: newX, y: newY, vx: newVx, vy: newVy };
          })
        );

        const gl = glRef.current;
        const canvas = canvasRef.current;
        const resources = resourcesRef.current;
        if (!gl || !canvas || !resources) return;

        const displayWidth = canvas.clientWidth;
        const displayHeight = canvas.clientHeight;

        if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
          canvas.width = displayWidth;
          canvas.height = displayHeight;
          gl.viewport(0, 0, displayWidth, displayHeight);
        }

        gl.clearColor(0.05, 0.05, 0.1, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.useProgram(resources.program);

        gl.bindBuffer(gl.ARRAY_BUFFER, resources.positionBuffer);
        gl.enableVertexAttribArray(resources.positionLocation);
        gl.vertexAttribPointer(resources.positionLocation, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, resources.normalBuffer);
        gl.enableVertexAttribArray(resources.normalLocation);
        gl.vertexAttribPointer(resources.normalLocation, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, resources.indexBuffer);

        const aspect = displayWidth / displayHeight || 1;
        const projectionMatrix = mat4.create();
        mat4.perspective(projectionMatrix, Math.PI / 4, aspect, 0.1, 100);

        const viewMatrix = mat4.create();
        mat4.identity(viewMatrix);
        mat4.translate(viewMatrix, viewMatrix, [0, 0, -5]);

        const modelMatrix = mat4.create();
        mat4.identity(modelMatrix);
        mat4.rotateY(modelMatrix, modelMatrix, rotationRef.current);

        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const mouseX = (mousePosition.x - rect.left) / rect.width - 0.5;
          mat4.rotateY(modelMatrix, modelMatrix, mouseX * 0.5);
        }

        const mvMatrix = mat4.create();
        mat4.multiply(mvMatrix, viewMatrix, modelMatrix);

        const mvpMatrix = mat4.create();
        mat4.multiply(mvpMatrix, projectionMatrix, mvMatrix);

        gl.uniformMatrix4fv(resources.matrixLocation, false, mvpMatrix);
        gl.uniformMatrix4fv(resources.normalMatrixLocation, false, modelMatrix);
        gl.uniform3fv(resources.lightDirectionLocation, [0.5, 0.7, 0.2]);
        gl.uniform3fv(resources.colorLocation, [0.65, 0.6, 1.0]);
        gl.uniform1f(resources.timeLocation, elapsedRef.current);

        gl.drawElements(gl.TRIANGLES, resources.indexCount, gl.UNSIGNED_SHORT, 0);
      },
      [mousePosition]
    )
  );

  return (
    <div ref={containerRef} className="relative h-[600px] w-full overflow-hidden bg-[#0c0c1a]">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      <div className="absolute inset-0">
        {particles.map((particle) => (
          <div
            key={particle.id}
            className="absolute rounded-full bg-white"
            style={{
              left: `${particle.x}%`,
              top: `${particle.y}%`,
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              opacity: particle.opacity,
            }}
          />
        ))}
      </div>

      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/20 blur-3xl"
        style={{ animation: "pulse 4s ease-in-out infinite" }}
      />

      <div className="relative z-10 flex h-full w-full items-center justify-center">
        <h1
          className="text-5xl font-bold text-white"
          style={{ animation: "fadeInUp 0.8s ease-out forwards", opacity: 0 }}
        >
          Say Something Bold
        </h1>
      </div>
    </div>
  );
};
