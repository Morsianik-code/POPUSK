package com.kapri.pet

import android.graphics.Rect
import kotlin.math.abs
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sqrt
import kotlin.random.Random

/**
 * Физика и поведение питомца. Ничего не знает про окна и отрисовку:
 * только координаты (x, y — левый верхний угол квадрата size×size) и состояние.
 */
class PetEngine(private val rnd: Random = Random.Default) {

    /** HIDDEN — питомца нет на экране; FACE — видно только лицо (глаза и улыбка). */
    enum class State { HIDDEN, FACE, FALL, JUMP, IDLE, WALK, SIT, SLEEP, CLIMB, HANG, DRAG }

    var state = State.HIDDEN
        private set

    var x = 0f
        private set
    var y = 0f
        private set
    var vx = 0f
        private set
    var vy = 0f
        private set

    /** Сторона квадрата питомца в пикселях. */
    var size = 100f
        private set

    var density = 1f
    var speedFactor = 1f

    /** 1 — смотрит вправо, -1 — влево. */
    var facing = 1
        private set

    /** -1 — на левой стене, 1 — на правой, 0 — не на стене. */
    var wallSide = 0
        private set

    /** Элемент интерфейса, на котором питомец сейчас стоит (null — на полу или в воздухе). */
    var support: Rect? = null
        private set

    /** Время с начала жизни, для анимаций. */
    var animTime = 0f
        private set

    /** Сколько ещё длится радостная реакция на тап. */
    var reactTime = 0f
        private set

    /** Появляться в случайные моменты и исчезать (иначе питомец всегда на экране). */
    var randomAppear = true

    /** Как часто появляется, 1..10. */
    var frequency = 6

    /** Можно ли показывать образ «только лицо» (у своего скина может не быть таких кадров). */
    var faceAllowed = true

    /** 0..1 — насколько питомец «проявился»: растёт при появлении, падает при исчезновении. */
    var presence = 0f
        private set

    private var appearAge = 0f
    private var vanish = 0f
    private var session = 0f
    private var tease = 0
    private var nextFace = false
    private var faceToBody = false

    private var screenW = 0f
    private var floorY = 0f
    private var topY = 0f

    private var timer = 0f
    private var thrown = false
    private var catchAny = false
    private var target: Rect? = null
    private var climbDir = -1
    private var platforms: List<Rect> = emptyList()

    val onPlatform: Boolean get() = support != null
    val isReacting: Boolean get() = reactTime > 0f

    /** Какую анимацию скина показывать. */
    val animKey: String
        get() = when (state) {
            State.FACE -> "face"
            State.WALK, State.HIDDEN -> "walk"
            State.IDLE, State.SIT -> "sit"
            State.SLEEP -> "sleep"
            State.CLIMB, State.HANG -> "climb"
            State.FALL, State.JUMP -> "fall"
            State.DRAG -> "drag"
        }

    private fun dp(v: Float) = v * density
    private fun range(a: Float, b: Float) = a + rnd.nextFloat() * (b - a)
    private fun chance(p: Float) = rnd.nextFloat() < p
    private val maxX: Float get() = (screenW - size).coerceAtLeast(0f)

    fun setBounds(width: Float, floor: Float, top: Float) {
        val first = screenW == 0f
        screenW = width
        floorY = floor
        topY = top
        if (first) {
            state = State.HIDDEN
            timer = 1.2f
            presence = 0f
            return
        }
        when (state) {
            State.HIDDEN -> Unit
            State.FACE -> startVanish()
            else -> {
                x = x.coerceIn(0f, maxX)
                y = y.coerceIn(topY, (floorY - size).coerceAtLeast(topY))
                if (state != State.DRAG) startFall()
            }
        }
    }

    /** Меняет размер, оставляя ноги на месте. */
    fun resize(newSize: Float) {
        if (newSize == size) return
        x += (size - newSize) / 2f
        y += size - newSize
        size = newSize
        if (screenW > 0f) {
            x = x.coerceIn(0f, maxX)
            if (state == State.CLIMB) x = if (wallSide < 0) 0f else maxX
            if (state == State.HANG) y = topY
        }
    }

    fun update(dtIn: Float) {
        val dt = min(dtIn, 0.1f)
        animTime += dt
        if (reactTime > 0f) reactTime -= dt

        if (state == State.HIDDEN) {
            timer -= dt
            if (timer <= 0f || !randomAppear) appear()
            return
        }
        if (vanish > 0f) {
            vanish -= dt
            presence = (vanish / VANISH_TIME).coerceIn(0f, 1f)
            if (vanish <= 0f) goHidden()
            return
        }
        appearAge += dt
        presence = (appearAge / APPEAR_TIME).coerceAtMost(1f)
        if (randomAppear && state != State.FACE) {
            session -= dt
            val calm = state == State.IDLE || state == State.WALK || state == State.SIT || state == State.SLEEP
            if (session <= 0f && calm) {
                startVanish()
                return
            }
        }

        when (state) {
            State.HIDDEN -> Unit
            State.FACE -> {
                timer -= dt
                if (timer <= 0f) {
                    if (faceToBody) becomeBody() else startVanish()
                }
            }
            State.DRAG -> Unit
            State.FALL, State.JUMP -> {
                // Физику считаем мелкими шагами, чтобы не проскочить платформу на медленном кадре.
                var left = dt
                while (left > 0f && (state == State.FALL || state == State.JUMP)) {
                    val step = min(left, 0.02f)
                    air(step)
                    left -= step
                }
            }
            State.IDLE -> {
                timer -= dt
                if (timer <= 0f) decide()
            }
            State.WALK -> walk(dt)
            State.SIT -> {
                timer -= dt
                if (timer <= 0f) {
                    when {
                        chance(0.12f) -> enter(State.SLEEP, range(12f, 30f))
                        support != null && chance(0.45f) -> hopOff()
                        else -> startWalk()
                    }
                }
            }
            State.SLEEP -> {
                timer -= dt
                if (timer <= 0f) enter(State.IDLE, range(1f, 2.5f))
            }
            State.CLIMB -> climb(dt)
            State.HANG -> hang(dt)
        }
    }

    // ---------- появление и исчезновение ----------

    private fun appear() {
        appearAge = 0f
        presence = 0f
        vanish = 0f
        if (randomAppear && faceAllowed && (nextFace || chance(0.4f))) {
            nextFace = false
            enterFace()
            return
        }
        nextFace = false
        tease = 0
        session = range(40f, 110f)
        x = range(0f, maxX)
        if (chance(0.5f)) {
            y = topY - size * 0.5f
            startFall()
        } else {
            y = floorY - size
            startFall()
            enter(State.IDLE, range(0.8f, 2f))
        }
    }

    /** Только лицо: выглядывает из-за края экрана или возникает прямо посреди него. */
    private fun enterFace() {
        support = null
        target = null
        vx = 0f
        vy = 0f
        faceToBody = chance(0.25f)
        if (chance(0.4f)) {
            val left = chance(0.5f)
            x = if (left) -size * 0.45f else screenW - size * 0.55f
            facing = if (left) 1 else -1
        } else {
            x = range(0f, maxX)
            facing = if (chance(0.5f)) 1 else -1
        }
        val lo = topY + size * 0.5f
        y = range(lo, (floorY - size * 2f).coerceAtLeast(lo))
        enter(State.FACE, range(4f, 9f))
    }

    private fun becomeBody() {
        x = x.coerceIn(0f, maxX)
        tease = 0
        session = range(40f, 110f)
        startFall()
    }

    private fun startVanish() {
        vanish = VANISH_TIME
    }

    private fun goHidden() {
        val again = nextFace
        support = null
        target = null
        vx = 0f
        vy = 0f
        presence = 0f
        enter(State.HIDDEN, 0f)
        // Дразнится: исчезла под пальцем — тут же выглянет в другом месте.
        timer = if (again) range(0.5f, 1.2f)
        else range(0.6f, 1.4f) * 600f / frequency.coerceIn(1, 10).toFloat().pow(1.5f)
    }

    // ---------- воздух ----------

    private fun air(dt: Float) {
        val prevFeet = y + size
        vy = (vy + dp(GRAVITY) * dt).coerceAtMost(dp(MAX_SPEED))
        x += vx * dt
        y += vy * dt

        if (x < 0f) {
            x = 0f
            if (hitWall(-1)) return
        } else if (x > maxX) {
            x = maxX
            if (hitWall(1)) return
        }

        if (y < topY) {
            y = topY
            if (vy < 0f) {
                if (thrown && vy < -dp(700f)) {
                    vy = -vy * 0.4f
                } else if (state == State.FALL && chance(0.5f)) {
                    enterHang()
                    return
                } else {
                    vy = 0f
                }
            }
        }

        if (vy <= 0f) return
        val feet = y + size
        val cx = x + size / 2f
        val t = target
        if (t != null) {
            if (crosses(t, prevFeet, feet, cx)) {
                land(t)
                return
            }
        } else if (catchAny) {
            for (p in platforms) {
                if (usable(p) && crosses(p, prevFeet, feet, cx)) {
                    land(p)
                    return
                }
            }
        }
        if (feet >= floorY) {
            y = floorY - size
            if (thrown && vy > dp(520f)) {
                vy = -vy * 0.45f
                vx *= 0.7f
            } else {
                land(null)
            }
        }
    }

    private fun crosses(p: Rect, prevFeet: Float, feet: Float, cx: Float) =
        prevFeet <= p.top + 1f && feet >= p.top && cx >= p.left && cx <= p.right

    /** @return true, если состояние сменилось и шаг физики надо прервать. */
    private fun hitWall(side: Int): Boolean {
        if (state == State.JUMP) {
            vx = 0f
            return false
        }
        if (thrown && abs(vx) > dp(320f)) {
            vx = -vx * 0.55f
            return false
        }
        if (y > topY + size * 0.2f && y + size < floorY - size * 0.3f && chance(0.45f)) {
            enterClimb(side, if (chance(0.8f)) -1 else 1)
            return true
        }
        vx = 0f
        return false
    }

    private fun land(p: Rect?) {
        val wasJump = state == State.JUMP
        support = p
        y = (p?.top?.toFloat() ?: floorY) - size
        vx = 0f
        vy = 0f
        thrown = false
        target = null
        if (p != null || wasJump) enter(State.SIT, range(5f, 14f))
        else enter(State.IDLE, range(0.4f, 1.5f))
    }

    private fun startFall() {
        support = null
        target = null
        thrown = false
        catchAny = false
        vx = 0f
        vy = 0f
        enter(State.FALL, 0f)
    }

    // ---------- земля ----------

    private fun enter(s: State, time: Float) {
        state = s
        timer = time
        if (s != State.CLIMB) wallSide = 0
    }

    private fun startWalk() {
        if (chance(0.5f)) facing = -facing
        enter(State.WALK, range(2f, 7f))
    }

    private fun decide() {
        val r = rnd.nextFloat()
        if (support != null) {
            when {
                r < 0.5f -> enter(State.SIT, range(5f, 14f))
                r < 0.7f -> startWalk()
                r < 0.85f -> if (!tryJump()) hopOff()
                else -> hopOff()
            }
            return
        }
        when {
            r < 0.38f && platforms.isNotEmpty() -> if (!tryJump()) startWalk()
            r < 0.72f -> startWalk()
            r < 0.92f -> enter(State.SIT, range(4f, 12f))
            else -> enter(State.SLEEP, range(12f, 30f))
        }
    }

    private fun walk(dt: Float) {
        val speed = dp(WALK_SPEED) * speedFactor
        x += facing * speed * dt
        val s = support
        if (s != null) {
            val cx = x + size / 2f
            if (cx < s.left || cx > s.right) {
                if (chance(0.55f)) {
                    x -= facing * speed * dt
                    facing = -facing
                } else {
                    // шагнул с края
                    support = null
                    target = null
                    thrown = false
                    catchAny = false
                    vx = facing * speed
                    vy = 0f
                    enter(State.FALL, 0f)
                    return
                }
            }
        }
        if (x <= 0f) {
            x = 0f
            if (support == null && chance(0.5f)) {
                enterClimb(-1, -1)
                return
            }
            facing = 1
        } else if (x >= maxX) {
            x = maxX
            if (support == null && chance(0.5f)) {
                enterClimb(1, -1)
                return
            }
            facing = -1
        }
        timer -= dt
        if (timer <= 0f) enter(State.IDLE, range(0.5f, 2f))
    }

    private fun hopOff() {
        support = null
        target = null
        thrown = false
        catchAny = false
        if (chance(0.5f)) facing = -facing
        vx = facing * dp(110f)
        vy = -dp(380f)
        enter(State.FALL, 0f)
    }

    private fun usable(p: Rect) =
        p.width() >= size * 0.7f && p.top - size >= topY && p.top < floorY - size * 0.4f

    private fun tryJump(): Boolean {
        val feet = y + size
        val options = platforms.filter { usable(it) && abs(it.top - feet) > size * 0.3f }
        if (options.isEmpty()) return false
        val p = options[rnd.nextInt(options.size)]

        val margin = min(size * 0.3f, p.width() * 0.25f)
        val cx = range(p.left + margin, p.right - margin)
        val tx = (cx - size / 2f).coerceIn(0f, maxX)
        val landCx = tx + size / 2f
        if (landCx < p.left || landCx > p.right) return false
        val ty = p.top - size

        var apex = min(y, ty) - size * range(0.5f, 1.1f)
        if (apex < topY) apex = topY
        val up = y - apex
        val down = ty - apex
        if (up < 1f || down < 0f) return false

        val g = dp(GRAVITY)
        val vy0 = -sqrt(2f * g * up)
        val time = -vy0 / g + sqrt(2f * down / g)
        if (time <= 0f) return false

        support = null
        thrown = false
        catchAny = false
        target = p
        vy = vy0
        vx = (tx - x) / time
        if (vx != 0f) facing = if (vx > 0f) 1 else -1
        enter(State.JUMP, 0f)
        return true
    }

    // ---------- стены и потолок ----------

    private fun enterClimb(side: Int, dir: Int) {
        support = null
        target = null
        thrown = false
        vx = 0f
        vy = 0f
        x = if (side < 0) 0f else maxX
        climbDir = dir
        enter(State.CLIMB, range(5f, 14f))
        wallSide = side
        updateClimbFacing()
    }

    // Питомец на стене нарисован повёрнутым на 90°, поэтому «вперёд» у него — вверх или вниз.
    private fun updateClimbFacing() {
        facing = if (wallSide < 0) climbDir else -climbDir
    }

    private fun climb(dt: Float) {
        y += climbDir * dp(CLIMB_SPEED) * speedFactor * dt
        if (y <= topY) {
            y = topY
            if (chance(0.6f)) enterHang() else letGo()
            return
        }
        if (y + size >= floorY) {
            y = floorY - size
            val away = -wallSide
            land(null)
            facing = away
            enter(State.WALK, range(2f, 6f))
            return
        }
        timer -= dt
        if (timer <= 0f) {
            val r = rnd.nextFloat()
            when {
                r < 0.25f -> letGo()
                r < 0.5f -> {
                    climbDir = -climbDir
                    updateClimbFacing()
                    timer = range(3f, 8f)
                }
                else -> timer = range(3f, 8f)
            }
        }
    }

    private fun letGo() {
        val away = -wallSide
        startFall()
        if (away != 0) {
            vx = away * dp(70f)
            facing = away
        }
    }

    private fun enterHang() {
        val away = if (wallSide != 0) -wallSide else if (chance(0.5f)) 1 else -1
        support = null
        target = null
        thrown = false
        vx = 0f
        vy = 0f
        y = topY
        facing = away
        enter(State.HANG, range(4f, 10f))
    }

    private fun hang(dt: Float) {
        x += facing * dp(HANG_SPEED) * speedFactor * dt
        if (x <= 0f) {
            x = 0f
            if (chance(0.5f)) {
                enterClimb(-1, 1)
                return
            }
            facing = 1
        } else if (x >= maxX) {
            x = maxX
            if (chance(0.5f)) {
                enterClimb(1, 1)
                return
            }
            facing = -1
        }
        timer -= dt
        if (timer <= 0f) startFall()
    }

    // ---------- платформы ----------

    /** Новый список элементов экрана. Если опора исчезла — питомец падает. */
    fun setPlatforms(list: List<Rect>) {
        platforms = list
        val s = support
        if (s != null) {
            val m = match(s)
            if (m == null || !usable(m)) {
                if (state != State.DRAG) startFall()
            } else {
                support = m
                y = m.top - size
            }
        }
        val t = target
        if (t != null) target = match(t)
    }

    /** Ищет тот же элемент после небольшого сдвига (например, при прокрутке). */
    private fun match(old: Rect): Rect? {
        val cx = x + size / 2f
        var best: Rect? = null
        var bestDiff = size * 0.6f
        for (p in platforms) {
            if (cx < p.left || cx > p.right) continue
            val diff = abs(p.top - old.top).toFloat()
            if (diff <= bestDiff) {
                bestDiff = diff
                best = p
            }
        }
        return best
    }

    // ---------- касания ----------

    fun onTap() {
        reactTime = 1.2f
        when (state) {
            State.FACE -> {
                // Играет в прятки: пару раз перепрыгивает в другое место, потом выходит целиком.
                tease++
                if (tease <= 2 && chance(0.7f)) {
                    nextFace = true
                    faceToBody = false
                    timer = 0.45f
                } else {
                    faceToBody = true
                    timer = 0.5f
                }
            }
            State.SLEEP -> enter(State.IDLE, range(1f, 2f))
            State.IDLE, State.WALK, State.SIT -> {
                // радостный подскок на месте
                val s = support
                support = null
                target = s
                thrown = false
                catchAny = false
                vx = 0f
                vy = -dp(430f)
                enter(State.FALL, 0f)
            }
            State.CLIMB -> letGo()
            State.HANG -> startFall()
            else -> Unit
        }
    }

    fun startDrag() {
        if (state == State.HIDDEN) return
        if (state == State.FACE) session = range(40f, 110f)
        vanish = 0f
        support = null
        target = null
        thrown = false
        vx = 0f
        vy = 0f
        enter(State.DRAG, 0f)
    }

    fun dragTo(nx: Float, ny: Float) {
        if (state != State.DRAG) return
        val newX = nx.coerceIn(0f, maxX)
        if (newX != x) facing = if (newX > x) 1 else -1
        x = newX
        y = ny.coerceIn(topY, (floorY - size).coerceAtLeast(topY))
    }

    fun release(velX: Float, velY: Float) {
        if (state != State.DRAG) return
        val limit = dp(MAX_SPEED)
        vx = velX.coerceIn(-limit, limit)
        vy = velY.coerceIn(-limit, limit)
        thrown = true
        catchAny = chance(0.5f)
        if (vx != 0f) facing = if (vx > 0f) 1 else -1
        enter(State.FALL, 0f)
    }

    private companion object {
        const val GRAVITY = 1900f      // dp/с²
        const val MAX_SPEED = 4200f    // dp/с
        const val WALK_SPEED = 46f     // dp/с
        const val CLIMB_SPEED = 38f
        const val HANG_SPEED = 30f
        const val APPEAR_TIME = 0.4f   // с
        const val VANISH_TIME = 0.35f
    }
}
