package tv.own.owntv.core.companion

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.BufferedInputStream
import java.io.ByteArrayInputStream

class CompanionBodyLimitsTest {
    private fun input(s: String) = BufferedInputStream(ByteArrayInputStream(s.toByteArray()))

    @Test fun negativeContentLengthIsRefusedNotCrashed() {
        assertNull(CompanionHttpProtocol.readBody(input("pin=1"), mapOf("content-length" to "-1"), 1024))
    }

    @Test fun oversizedDeclaredBodyIsRefused() {
        assertNull(CompanionHttpProtocol.readBody(input("x"), mapOf("content-length" to "2048"), 1024))
    }

    @Test fun exactBodyIsRead() {
        assertEquals("pin=123456", CompanionHttpProtocol.readBody(input("pin=123456"), mapOf("content-length" to "10"), 1024))
    }
}
